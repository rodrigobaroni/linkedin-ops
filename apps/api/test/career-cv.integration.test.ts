/**
 * CV base flow against a real PostgreSQL (career PR 2, spec 2026-10-22 §5): upload → `EXTRACTING` draft
 * with the PDF text only (the file is never stored) → `cv.extract` enqueued with the draft id only → the
 * worker side (`PrismaCvBaseDraftStore`, the port the `cv.extract` handler uses, called directly here) →
 * review and confirm → new version deactivates the previous one → delete everything. Personal data never
 * reaches logs or the audit trail (canary). The producer is the real pg-boss one: the job row is inserted by
 * pg-boss's own SQL inside the draft's Prisma transaction, so a rollback leaves neither draft nor job.
 *
 * Without Docker, point `INTEGRATION_DATABASE_URL` at an EMPTY database (e.g. a throwaway local cluster);
 * the container is then skipped.
 */
import "reflect-metadata";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Test } from "@nestjs/testing";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  CV_UPLOAD_LIMITS,
  CvBaseStateSchema,
  CvBaseSchema,
  CvStructuredSchema,
  PGBOSS_SCHEMA_NAME,
  QUEUES,
  CvUploadAcceptedSchema,
  type CvExtractPayload,
  type CvStructured,
} from "@linkedin-ops/contracts";
import {
  createPrismaClient,
  CV_EXTRACTION_STALE_MS,
  CV_EXTRACTION_SWEEP_BATCH,
  deriveCsrfToken,
  hashSessionSecret,
  newId,
  PrismaCvBaseDraftStore,
  PrismaCvBases,
  validateRuntimeEnv,
  type CvExtractionResult,
  type SqlExecutor,
  type PrismaClient,
  type RuntimeEnv,
} from "@linkedin-ops/domain";
import { PgBoss } from "pg-boss";
import supertest from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module.js";
import { configureApp, createFastifyAdapter } from "../src/app.factory.js";
import { CAREER_RATE_LIMITS } from "../src/career/cv-base.service.js";
import {
  CV_EXTRACT_QUEUE,
  PgBossCvExtractQueue,
  type CvExtractQueue,
} from "../src/career/cv-extract.queue.js";
import { CvExtractionSweeper } from "../src/career/cv-extraction.sweeper.js";
import { REQUESTED_WITH_VALUE } from "../src/common/route-access.guard.js";
import { createLogger } from "../src/logging/logger.js";
import { fictitiousCvStructured } from "./fixtures/cv-structured.js";
import { fictitiousCvPdf, fictitiousCvPdfOfSize } from "./fixtures/pdf.js";
import { APP_BASE_URL, LogCapture, cookieHeader, mutationHeaders } from "./helpers.js";

const POSTGRES_IMAGE =
  "postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24";
const DOMAIN_ROOT = fileURLToPath(new URL("../../../packages/domain", import.meta.url));
const PRISMA_BIN = fileURLToPath(
  new URL("../../../packages/domain/node_modules/.bin/prisma", import.meta.url),
);
const UPLOAD_LIMIT = 4;

/**
 * The real producer; `failAfterInsertNext` makes the next enqueue throw AFTER pg-boss inserted the job row
 * through the draft's transaction, so the rollback must take both away. `unreachable` is a real producer
 * whose database cannot be reached: `useUnreachable` routes the upload to it (its start fails).
 */
class FailableQueue implements CvExtractQueue {
  real: PgBossCvExtractQueue | undefined;
  unreachable: PgBossCvExtractQueue | undefined;
  failAfterInsertNext = false;
  useUnreachable = false;
  enqueueCalls = 0;

  ensureReady(): Promise<void> {
    const target = this.useUnreachable ? this.unreachable : this.real;
    if (!target) throw new Error("queue not set up");
    return target.ensureReady();
  }

  async enqueue(payload: CvExtractPayload, db: SqlExecutor): Promise<{ jobId: string }> {
    if (!this.real) throw new Error("queue not set up");
    this.enqueueCalls += 1;
    const result = await this.real.enqueue(payload, db);
    if (this.failAfterInsertNext) {
      this.failAfterInsertNext = false;
      throw new Error("queue down after insert");
    }
    return result;
  }
}

interface JobRow {
  id: string;
  data: unknown;
  singletonKey: string | null;
  retryLimit: number;
  deadLetter: string | null;
}

/** `cv.extract` rows in pg-boss's own table (read with plain SQL, not through pg-boss). */
async function cvExtractJobs(): Promise<JobRow[]> {
  return prisma.$queryRawUnsafe<JobRow[]>(
    `SELECT "id"::text AS "id", "data", "singleton_key" AS "singletonKey", "retry_limit" AS "retryLimit",
            "dead_letter" AS "deadLetter"
       FROM "${PGBOSS_SCHEMA_NAME}"."job" WHERE "name" = 'cv.extract' ORDER BY "created_on"`,
  );
}

function extraction(
  cv: CvStructured = fictitiousCvStructured(),
  overrides: Partial<CvExtractionResult> = {},
): CvExtractionResult {
  return {
    cv,
    parseWarnings: [],
    injectionSuspected: false,
    injectionEvidence: null,
    generation: {
      model: "gpt-test",
      promptVersions: { "cv-extract": "1.0.0" },
      engineVersion: "0.1.0",
    },
    ...overrides,
  };
}

let container: StartedPostgreSqlContainer | undefined;
let prisma: PrismaClient;
let app: NestFastifyApplication;
let request: ReturnType<typeof supertest>;
let env: RuntimeEnv;
let worker: PrismaCvBaseDraftStore;
let boss: PgBoss;
const queue = new FailableQueue();
const logs = new LogCapture();

interface Actor {
  userId: string;
  cookie: string;
  csrfToken: string;
}

async function newActor(options: { elevated?: boolean } = {}): Promise<Actor> {
  const userId = newId();
  const sessionId = newId();
  await prisma.user.create({
    data: {
      id: userId,
      email: `owner-${userId}@example.test`,
      passwordHash: "not-a-login",
      name: "Owner",
    },
  });
  const cookie = randomBytes(32).toString("base64url");
  await prisma.session.create({
    data: {
      id: sessionId,
      userId,
      secretHash: hashSessionSecret(cookie),
      expiresAt: new Date(Date.now() + 3_600_000),
      elevatedUntil: options.elevated ? new Date(Date.now() + 15 * 60_000) : null,
    },
  });
  return { userId, cookie, csrfToken: deriveCsrfToken(env.sessionSecret, sessionId) };
}

function upload(actor: Actor, file: Buffer = fictitiousCvPdf()) {
  return request
    .post("/api/v1/career/cv")
    .set({
      origin: APP_BASE_URL,
      "x-requested-with": REQUESTED_WITH_VALUE,
      cookie: cookieHeader(actor.cookie),
    })
    .attach("file", file, { filename: "meu-cv.pdf", contentType: "application/pdf" });
}

function getState(actor: Actor) {
  return request.get("/api/v1/career/cv").set("cookie", cookieHeader(actor.cookie));
}

function confirm(actor: Actor, draftId: string, content: unknown, extra: object = {}) {
  return request
    .post("/api/v1/career/cv/confirm")
    .set(mutationHeaders({ cookie: cookieHeader(actor.cookie) }))
    .send({ draftId, content, ...extra });
}

function deleteAll(actor: Actor) {
  return request
    .delete("/api/v1/career/cv")
    .set(mutationHeaders({ cookie: cookieHeader(actor.cookie), "x-csrf-token": actor.csrfToken }))
    .send({});
}

const JOB_META = { jobId: "job-test", correlationId: "job-test" };

/** Upload + simulated `cv.extract` success; returns the READY draft id. */
async function readyDraft(actor: Actor, result = extraction()): Promise<string> {
  const res = await upload(actor).expect(202);
  await worker.completeExtraction(res.body.id as string, result, JOB_META);
  const row = await prisma.cvBase.findUniqueOrThrow({ where: { id: res.body.id as string } });
  expect(row.status).toBe("READY");
  return res.body.id as string;
}

beforeAll(async () => {
  let databaseUrl = process.env.INTEGRATION_DATABASE_URL;
  if (!databaseUrl) {
    container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
    databaseUrl = container.getConnectionUri();
  }
  execFileSync(PRISMA_BIN, ["migrate", "deploy"], {
    cwd: DOMAIN_ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: ["ignore", "pipe", "pipe"],
  });
  env = validateRuntimeEnv({
    NODE_ENV: "test",
    APP_BASE_URL,
    DATABASE_URL: databaseUrl,
    SESSION_SECRET: randomBytes(48).toString("base64"),
    ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  });
  // What the worker does at boot: install the pgboss schema and provision `cv.extract` (+ its DLQ).
  boss = new PgBoss({ connectionString: databaseUrl, schema: PGBOSS_SCHEMA_NAME });
  await boss.start();
  const definition = QUEUES["cv.extract"];
  if ((await boss.getQueue(definition.deadLetter)) === null) {
    await boss.createQueue(definition.deadLetter, { retryLimit: 0 });
  }
  if ((await boss.getQueue(definition.name)) === null) {
    await boss.createQueue(definition.name, {
      retryLimit: definition.retryLimit,
      retryDelay: definition.retryDelaySeconds,
      retryBackoff: definition.retryBackoff,
      expireInSeconds: definition.expireInSeconds,
      deadLetter: definition.deadLetter,
    });
  }
  prisma = createPrismaClient({ connectionString: databaseUrl });
  worker = new PrismaCvBaseDraftStore(
    new PrismaCvBases(prisma, (value) => CvStructuredSchema.parse(value)),
  );
  const logger = createLogger({ level: "info", pretty: false, stream: logs.stream });
  queue.real = new PgBossCvExtractQueue(databaseUrl, logger);
  // Started at bootstrap, as in the app (outside any upload transaction).
  await queue.real.onApplicationBootstrap();
  expect(queue.real.ready).toBe(true);
  // Port 1: connection refused at once.
  queue.unreachable = new PgBossCvExtractQueue(
    "postgresql://api:api-test-password@127.0.0.1:1/api_test",
    logger,
    { startTimeoutMs: 2_000, retry: { initialMs: 50, maxMs: 200 } },
  );
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forRoot({ env, logger })],
  })
    .overrideProvider(CV_EXTRACT_QUEUE)
    .useValue(queue)
    .overrideProvider(CAREER_RATE_LIMITS)
    .useValue({ windowMs: 60_000, uploadPerUser: UPLOAD_LIMIT })
    .compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter(logger), {
    bufferLogs: true,
    bodyParser: false,
  });
  await configureApp(app, env, logger);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  request = supertest(app.getHttpServer());
});

afterAll(async () => {
  await app?.close();
  await queue.real?.onApplicationShutdown();
  await queue.unreachable?.onApplicationShutdown();
  await boss?.stop({ graceful: false, close: true });
  await prisma?.$disconnect();
  await container?.stop();
});

beforeEach(() => {
  queue.failAfterInsertNext = false;
  queue.useUnreachable = false;
  queue.enqueueCalls = 0;
});

describe("POST /career/cv (upload)", () => {
  it("answers 202 with an EXTRACTING draft, stores only the PDF text and enqueues the draft id", async () => {
    const actor = await newActor();
    const before = (await cvExtractJobs()).length;
    const res = await upload(actor).expect(202);
    expect(CvUploadAcceptedSchema.parse(res.body)).toMatchObject({
      status: "EXTRACTING",
      draft: {
        status: "EXTRACTING",
        version: 1,
        content: null,
        failureReason: null,
        parseWarnings: [],
        injectionSuspected: false,
        injectionEvidence: null,
      },
    });
    expect(res.body.id).toBe(res.body.draft.id);
    expect(res.headers.location).toBe("/api/v1/career/cv");
    expect(res.headers["cache-control"]).toBe("no-store");

    // pg-boss's insert ran through `$queryRawUnsafe` in the draft's transaction: json payload, uuid id
    // returned to the caller, queue policy (retries, dead letter) applied by the database.
    const jobs = await cvExtractJobs();
    expect(jobs).toHaveLength(before + 1);
    const job = jobs.at(-1);
    expect(job).toEqual({
      id: res.body.jobId,
      data: {
        schemaVersion: 1,
        correlationId: res.headers["x-correlation-id"],
        requestedBy: { type: "USER", id: actor.userId },
        cvBaseId: res.body.id,
      },
      singletonKey: res.body.id,
      retryLimit: QUEUES["cv.extract"].retryLimit,
      deadLetter: QUEUES["cv.extract"].deadLetter,
    });
    const row = await prisma.cvBase.findUniqueOrThrow({ where: { id: res.body.id as string } });
    expect(row.extractedText).toContain("Ana Exemplo da Silva");
    expect(row.extractedText).toContain("Universidade Imaginária");
    // Nothing that looks like the file itself was stored, and the text never went into the job table.
    expect(JSON.stringify(row)).not.toContain("%PDF");
    expect(JSON.stringify(job)).not.toContain("Ana Exemplo");
  });

  it("accepts a valid PDF of exactly 5 MiB (the limit is inclusive)", async () => {
    const actor = await newActor();
    const file = fictitiousCvPdfOfSize(CV_UPLOAD_LIMITS.maxBytes);
    expect(file.length).toBe(5 * 1024 * 1024);
    const res = await upload(actor, file).expect(202);
    expect(res.body.status).toBe("EXTRACTING");
  });

  it("a new upload replaces the pending draft (one draft per user)", async () => {
    const actor = await newActor();
    const first = await upload(actor).expect(202);
    const second = await upload(actor).expect(202);
    const drafts = await prisma.cvBase.findMany({ where: { userId: actor.userId } });
    expect(drafts.map((row) => row.id)).toEqual([second.body.id]);
    expect(second.body.draft.version).toBe(1);
    expect(first.body.id).not.toBe(second.body.id);
  });

  it("a queue failure after the job insert rolls back draft and job together (503, nothing stored)", async () => {
    const actor = await newActor();
    const previous = (await upload(actor).expect(202)).body.id as string;
    const jobsBefore = await cvExtractJobs();
    const auditBefore = await prisma.auditEvent.count({ where: { userId: actor.userId } });

    queue.failAfterInsertNext = true;
    const res = await upload(actor).expect(503);
    expect(res.body.code).toBe("UPSTREAM_UNAVAILABLE");

    expect(await cvExtractJobs()).toEqual(jobsBefore);
    // The replaced draft is still the pending one: its deletion was rolled back as well.
    const rows = await prisma.cvBase.findMany({ where: { userId: actor.userId } });
    expect(rows.map((row) => [row.id, row.status])).toEqual([[previous, "EXTRACTING"]]);
    expect(await prisma.auditEvent.count({ where: { userId: actor.userId } })).toBe(auditBefore);
    expect(logs.text).toContain("cv.extract enqueue failed; draft rolled back");
  });

  it("a producer that failed to start answers 503 before any transaction: no draft, no job, no audit", async () => {
    const actor = await newActor();
    const jobsBefore = await cvExtractJobs();
    const unreachable = queue.unreachable;
    if (!unreachable) throw new Error("queue not set up");
    // Bootstrap failure does not throw (the API boots anyway) and leaves the producer not ready.
    await expect(unreachable.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(unreachable.ready).toBe(false);

    queue.useUnreachable = true;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const res = await upload(actor).expect(503);
      expect(res.body.code).toBe("UPSTREAM_UNAVAILABLE");
    }
    expect(queue.enqueueCalls).toBe(0);
    expect(await prisma.cvBase.count({ where: { userId: actor.userId } })).toBe(0);
    expect(await prisma.auditEvent.count({ where: { userId: actor.userId } })).toBe(0);
    expect(await cvExtractJobs()).toEqual(jobsBefore);
    // Retried in the background with backoff (not by the requests), each failure logged.
    await expect
      .poll(
        () =>
          logs.text.split("cv.extract producer start failed; retrying in the background").length -
          1,
        { timeout: 10_000, interval: 50 },
      )
      .toBeGreaterThanOrEqual(3);
    expect(logs.text).not.toContain("api-test-password");

    // `enqueue` never starts the producer itself: called inside a transaction it fails without SQL.
    const db = { executeSql: vi.fn() };
    await expect(
      unreachable.enqueue(
        {
          schemaVersion: 1,
          correlationId: "corr-x",
          requestedBy: { type: "USER", id: actor.userId },
          cvBaseId: newId(),
        },
        db,
      ),
    ).rejects.toThrow("not_started");
    expect(db.executeSql).not.toHaveBeenCalled();

    // Once the producer is reachable again, the next upload goes through.
    queue.useUnreachable = false;
    await upload(actor).expect(202);
  });

  it("is rate limited per user", async () => {
    const actor = await newActor();
    for (let attempt = 0; attempt < UPLOAD_LIMIT; attempt += 1) await upload(actor).expect(202);
    const res = await upload(actor).expect(429);
    expect(res.body.code).toBe("RATE_LIMITED");
    expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
  });
});

describe("GET /career/cv", () => {
  it("is empty for a new user", async () => {
    const actor = await newActor();
    const res = await getState(actor).expect(200);
    expect(res.body).toEqual({ active: null, draft: null });
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("shows the draft as EXTRACTING, then READY with content once cv.extract finished", async () => {
    const actor = await newActor();
    const { body } = await upload(actor).expect(202);
    expect((await getState(actor).expect(200)).body.draft.status).toBe("EXTRACTING");

    await worker.completeExtraction(
      body.id as string,
      extraction(fictitiousCvStructured(), {
        parseWarnings: [{ field: "experiences", message: "datas ambíguas" }],
      }),
      JOB_META,
    );
    const state = CvBaseStateSchema.parse((await getState(actor).expect(200)).body);
    expect(state.active).toBeNull();
    expect(state.draft).toMatchObject({
      status: "READY",
      content: fictitiousCvStructured(),
      parseWarnings: [{ field: "experiences", message: "datas ambíguas" }],
      injectionSuspected: false,
      injectionEvidence: null,
    });
    const row = await prisma.cvBase.findUniqueOrThrow({ where: { id: body.id as string } });
    expect(row.extractedText).toBeNull();
  });

  it("settles a draft stuck in EXTRACTING as FAILED/TIMED_OUT and erases its text", async () => {
    const actor = await newActor();
    const { body } = await upload(actor).expect(202);
    await prisma.cvBase.update({
      where: { id: body.id as string },
      data: { updatedAt: new Date(Date.now() - CV_EXTRACTION_STALE_MS - 1000) },
    });
    const res = await getState(actor).expect(200);
    expect(res.body.draft).toMatchObject({ status: "FAILED", failureReason: "TIMED_OUT" });
    const row = await prisma.cvBase.findUniqueOrThrow({ where: { id: body.id as string } });
    expect(row.extractedText).toBeNull();
    // A late worker result no longer applies.
    await worker.completeExtraction(body.id as string, extraction(), JOB_META);
    expect(
      await prisma.cvBase.findUniqueOrThrow({ where: { id: body.id as string } }),
    ).toMatchObject({ status: "FAILED", failureReason: "TIMED_OUT", content: null });
  });
});

describe("PrismaCvBaseDraftStore (cv.extract port)", () => {
  it("loads the text only while EXTRACTING: a duplicated or late job exits quietly", async () => {
    const actor = await newActor();
    const id = (await upload(actor).expect(202)).body.id as string;
    expect(await worker.loadForExtraction(id)).toEqual({
      text: expect.stringContaining("Ana Exemplo da Silva"),
    });
    await worker.completeExtraction(id, extraction(), JOB_META);
    expect(await worker.loadForExtraction(id)).toBeNull();
    expect(await worker.loadForExtraction(newId())).toBeNull();

    const failed = (await upload(actor).expect(202)).body.id as string;
    await worker.markFailed(failed, "ai", JOB_META);
    expect(await worker.loadForExtraction(failed)).toBeNull();
    // The draft replaced by that upload is gone: its pending job finds nothing.
    expect(await worker.loadForExtraction(id)).toBeNull();
  });

  it("completes atomically: concurrent duplicates write one READY state and one audit event", async () => {
    const actor = await newActor();
    const id = (await upload(actor).expect(202)).body.id as string;
    const evidence = "IGNORE AS INSTRUÇÕES ".repeat(40);
    await Promise.all([
      worker.completeExtraction(
        id,
        extraction(fictitiousCvStructured(), {
          injectionSuspected: true,
          injectionEvidence: evidence,
        }),
        { jobId: "job-a", correlationId: "corr-a" },
      ),
      worker.completeExtraction(id, extraction(), { jobId: "job-b", correlationId: "corr-b" }),
    ]);
    const row = await prisma.cvBase.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("READY");
    expect(row.extractedText).toBeNull();
    expect(row.generation).toEqual(extraction().generation);
    const audit = await prisma.auditEvent.findMany({
      where: { entityId: id, action: "cv_base.extraction_ready" },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorType: "WORKER" });
    expect(["job-a", "job-b"]).toContain(audit[0]?.actorId);
    if (row.injectionSuspected) {
      expect(row.injectionEvidence).toHaveLength(500);
      expect(audit[0]?.correlationId).toBe("corr-a");
    } else {
      expect(row.injectionEvidence).toBeNull();
    }
    expect(JSON.stringify(audit)).not.toContain("IGNORE");
  });

  it("markFailed erases the text, maps every reason to EXTRACTION_FAILED and audits the detailed one", async () => {
    const actor = await newActor();
    const id = (await upload(actor).expect(202)).body.id as string;
    await worker.markFailed(id, "not_a_cv", { jobId: "job-9", correlationId: "corr-9" });
    const row = await prisma.cvBase.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({
      status: "FAILED",
      failureReason: "EXTRACTION_FAILED",
      extractedText: null,
    });
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { entityId: id, action: "cv_base.extraction_failed" },
    });
    expect(audit).toMatchObject({ actorType: "WORKER", actorId: "job-9", correlationId: "corr-9" });
    expect(audit.after).toMatchObject({ status: "FAILED", cause: "not_a_cv" });

    // Once settled, neither a late success nor a second failure changes anything.
    await worker.completeExtraction(id, extraction(), JOB_META);
    await worker.markFailed(id, "ai", JOB_META);
    expect(await prisma.cvBase.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: "FAILED",
      content: null,
    });
    expect(
      await prisma.auditEvent.count({
        where: { entityId: id, action: { startsWith: "cv_base.extraction" } },
      }),
    ).toBe(1);
  });
});

describe("CvExtractionSweeper (Sentinela S-2)", () => {
  it("settles stale EXTRACTING drafts of every user and erases their text, without any read", async () => {
    const [first, second, fresh] = [await newActor(), await newActor(), await newActor()];
    const stale = new Date(Date.now() - CV_EXTRACTION_STALE_MS - 1000);
    const staleIds: string[] = [];
    for (const actor of [first, second]) {
      const { body } = await upload(actor).expect(202);
      staleIds.push(body.id as string);
      await prisma.cvBase.update({ where: { id: body.id as string }, data: { updatedAt: stale } });
    }
    const pending = (await upload(fresh).expect(202)).body.id as string;

    expect(await app.get(CvExtractionSweeper).sweep()).toBeGreaterThanOrEqual(2);

    const rows = await prisma.cvBase.findMany({ where: { id: { in: [...staleIds, pending] } } });
    for (const id of staleIds) {
      expect(rows.find((row) => row.id === id)).toMatchObject({
        status: "FAILED",
        failureReason: "TIMED_OUT",
        extractedText: null,
      });
    }
    expect(rows.find((row) => row.id === pending)).toMatchObject({ status: "EXTRACTING" });
    expect(
      await prisma.auditEvent.count({
        where: {
          entityId: { in: staleIds },
          action: "cv_base.extraction_failed",
          actorType: "SYSTEM",
        },
      }),
    ).toBe(2);
    // Nothing left to settle on the next pass (the fresh draft is not stale).
    expect(await app.get(CvExtractionSweeper).sweep()).toBe(0);
  });

  it("settles a backlog larger than one pass in bounded passes, skipping a draft a writer holds", async () => {
    const stale = new Date(Date.now() - CV_EXTRACTION_STALE_MS - 1000);
    const ids: string[] = [];
    // One stale draft per owner (at most one draft per user), older than any other test's drafts.
    for (let i = 0; i < CV_EXTRACTION_SWEEP_BATCH + 10; i += 1) {
      const { userId } = await newActor();
      const id = newId();
      await prisma.cvBase.create({
        data: {
          id,
          userId,
          version: 1,
          status: "EXTRACTING",
          extractedText: "texto do CV",
          createdAt: stale,
          updatedAt: new Date(stale.getTime() - (CV_EXTRACTION_SWEEP_BATCH + 10 - i) * 1000),
        },
      });
      ids.push(id);
    }
    // A concurrent writer holds the oldest draft: the sweep skips it instead of waiting.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let locked!: () => void;
    const lockTaken = new Promise<void>((resolve) => (locked = resolve));
    const writer = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "cv_bases" WHERE "id" = ${ids[0]}::uuid FOR UPDATE`;
        locked();
        await held;
      },
      { timeout: 30_000 },
    );
    await lockTaken;

    const sweeper = app.get(CvExtractionSweeper);
    expect(await sweeper.sweep()).toBe(CV_EXTRACTION_SWEEP_BATCH - 1);
    expect((await prisma.cvBase.findUniqueOrThrow({ where: { id: ids[0]! } })).status).toBe(
      "EXTRACTING",
    );
    release();
    await writer;
    await sweeper.sweep();
    expect(
      await prisma.cvBase.count({
        where: {
          id: { in: ids },
          status: "FAILED",
          failureReason: "TIMED_OUT",
          extractedText: null,
        },
      }),
    ).toBe(ids.length);
  });
});

describe("POST /career/cv/confirm", () => {
  it("activates the reviewed content (the owner's edits win over the extraction)", async () => {
    const actor = await newActor();
    const draftId = await readyDraft(actor);
    const edited = fictitiousCvStructured();
    edited.contact.name = "Ana E. da Silva";
    const res = await confirm(actor, draftId, edited).expect(200);
    expect(CvBaseSchema.parse(res.body)).toMatchObject({
      id: draftId,
      version: 1,
      content: edited,
    });

    const state = (await getState(actor).expect(200)).body;
    expect(state.draft).toBeNull();
    expect(state.active.content.contact.name).toBe("Ana E. da Silva");
  });

  it("a new confirmed version deactivates the previous one", async () => {
    const actor = await newActor();
    const first = await readyDraft(actor);
    await confirm(actor, first, fictitiousCvStructured()).expect(200);
    const second = await readyDraft(actor);
    const res = await confirm(actor, second, fictitiousCvStructured()).expect(200);
    expect(res.body.version).toBe(2);

    const rows = await prisma.cvBase.findMany({
      where: { userId: actor.userId },
      orderBy: { version: "asc" },
    });
    expect(rows.map((row) => [row.version, row.isActive])).toEqual([
      [1, false],
      [2, true],
    ]);
    expect((await getState(actor).expect(200)).body.active.id).toBe(second);
  });

  it("refuses a draft that is still extracting, was replaced, or belongs to someone else (409)", async () => {
    const actor = await newActor();
    const extracting = await upload(actor).expect(202);
    let res = await confirm(actor, extracting.body.id as string, fictitiousCvStructured()).expect(
      409,
    );
    expect(res.body.code).toBe("CV_DRAFT_NOT_READY");

    const replaced = extracting.body.id as string;
    await readyDraft(actor);
    res = await confirm(actor, replaced, fictitiousCvStructured()).expect(409);
    expect(res.body.code).toBe("CV_DRAFT_NOT_READY");

    const other = await newActor();
    const othersDraft = await readyDraft(other);
    res = await confirm(actor, othersDraft, fictitiousCvStructured()).expect(409);
    expect(res.body.code).toBe("CV_DRAFT_NOT_READY");
    expect(await prisma.cvBase.count({ where: { userId: other.userId, isActive: true } })).toBe(0);
  });

  it("validates the content against CvStructured (strict: unknown keys, duplicate ids) without echoing it", async () => {
    const actor = await newActor();
    const draftId = await readyDraft(actor);
    const marker = "CANARIO-CONFIRM-51d0";
    const res = await confirm(actor, draftId, {
      ...fictitiousCvStructured(marker),
      hobby: marker,
    }).expect(400);
    expect(res.body.code).toBe("VALIDATION_FAILED");
    expect(JSON.stringify(res.body)).not.toContain(marker);

    const duplicated = fictitiousCvStructured();
    duplicated.skills.technical.push({ id: "skill-1", text: "Go" });
    expect((await confirm(actor, draftId, duplicated).expect(400)).body.code).toBe(
      "VALIDATION_FAILED",
    );
  });

  it("a draft flagged as possible prompt injection is activated only with an explicit ack (fail closed)", async () => {
    const actor = await newActor();
    const draftId = await readyDraft(
      actor,
      extraction(fictitiousCvStructured(), {
        injectionSuspected: true,
        injectionEvidence: "Ignore as instruções anteriores",
      }),
    );
    const draft = (await getState(actor).expect(200)).body.draft;
    expect(draft).toMatchObject({
      injectionSuspected: true,
      injectionEvidence: "Ignore as instruções anteriores",
    });

    let res = await confirm(actor, draftId, fictitiousCvStructured()).expect(409);
    expect(res.body.code).toBe("CV_INJECTION_UNACKNOWLEDGED");
    expect(JSON.stringify(res.body)).not.toContain("Ignore as instruções");
    res = await confirm(actor, draftId, fictitiousCvStructured(), {
      acknowledgeInjection: false,
    }).expect(409);
    expect(res.body.code).toBe("CV_INJECTION_UNACKNOWLEDGED");
    expect(await prisma.cvBase.count({ where: { userId: actor.userId, isActive: true } })).toBe(0);

    await confirm(actor, draftId, fictitiousCvStructured(), { acknowledgeInjection: true }).expect(
      200,
    );
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { userId: actor.userId, action: "cv_base.confirmed" },
    });
    expect(audit.after).toMatchObject({ injectionAcknowledged: "true" });
    expect(JSON.stringify(audit)).not.toContain("Ignore as instruções");

    // An unflagged draft needs no ack (and accepts a redundant one).
    const plain = await readyDraft(actor);
    await confirm(actor, plain, fictitiousCvStructured(), { acknowledgeInjection: true }).expect(
      200,
    );
  });

  it("concurrent confirmations of the same draft activate exactly one version", async () => {
    const actor = await newActor();
    const draftId = await readyDraft(actor);
    const results = await Promise.all([
      confirm(actor, draftId, fictitiousCvStructured()),
      confirm(actor, draftId, fictitiousCvStructured()),
    ]);
    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
    expect(await prisma.cvBase.count({ where: { userId: actor.userId, isActive: true } })).toBe(1);
  });
});

describe("DELETE /career/cv", () => {
  it("requires a recent re-authentication", async () => {
    const actor = await newActor({ elevated: false });
    const res = await deleteAll(actor).expect(401);
    expect(res.body.code).toBe("AUTH_REAUTH_REQUIRED");
  });

  it("deletes every version and the draft, and only the owner's", async () => {
    const actor = await newActor({ elevated: true });
    const other = await newActor();
    await confirm(actor, await readyDraft(actor), fictitiousCvStructured()).expect(200);
    await confirm(actor, await readyDraft(actor), fictitiousCvStructured()).expect(200);
    await upload(actor).expect(202);
    await readyDraft(other);

    await deleteAll(actor).expect(204);
    expect(await prisma.cvBase.count({ where: { userId: actor.userId } })).toBe(0);
    expect(await prisma.cvBase.count({ where: { userId: other.userId } })).toBe(1);
    expect((await getState(actor).expect(200)).body).toEqual({ active: null, draft: null });
    // Idempotent.
    await deleteAll(actor).expect(204);

    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { userId: actor.userId, action: "cv_base.deleted" },
    });
    expect(audit.after).toEqual({ deletedVersions: 3 });
  });
});

describe("personal data (canary)", () => {
  it("CV text never reaches logs, audit events or error responses", async () => {
    const marker = "CANARIO-INTEGRACAO-9b2e";
    const actor = await newActor({ elevated: true });
    const res = await upload(actor, fictitiousCvPdf(marker)).expect(202);
    expect(JSON.stringify(res.body)).not.toContain(marker);
    await worker.completeExtraction(
      res.body.id as string,
      extraction(fictitiousCvStructured(marker), {
        parseWarnings: [{ field: "contact", message: marker }],
        injectionSuspected: true,
        injectionEvidence: marker,
      }),
      { jobId: "job-canary", correlationId: "job-canary" },
    );
    await confirm(actor, res.body.id as string, fictitiousCvStructured(marker)).expect(409);
    await confirm(actor, res.body.id as string, fictitiousCvStructured(marker), {
      acknowledgeInjection: true,
    }).expect(200);
    await deleteAll(actor).expect(204);

    expect(logs.text).not.toContain(marker);
    expect(logs.text).not.toContain("Ana Exemplo");
    const audit = await prisma.auditEvent.findMany({
      where: { userId: actor.userId },
      orderBy: { id: "asc" },
    });
    expect(audit.map((event) => event.action)).toEqual([
      "cv_base.draft_started",
      "cv_base.extraction_ready",
      "cv_base.confirmed",
      "cv_base.deleted",
    ]);
    expect(JSON.stringify(audit)).not.toContain(marker);
    expect(JSON.stringify(audit)).not.toContain("Ana Exemplo");
  });
});
