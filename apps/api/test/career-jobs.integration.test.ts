/**
 * Batches and job postings against a real PostgreSQL and the real pg-boss producer (career PR 3b, spec
 * 2026-10-22 §5, §7 and §9): `POST /career/batches` → one `FETCHING` posting per distinct link and one
 * `job.fetch` per posting, grouped by registrable domain, in the batch's transaction → the worker side
 * (`PrismaJobPostingStore`, called directly here, enqueuing `cv.tailor` through the same producer) → list
 * and detail → pasted text, retry, deletion. N4 on every mutation; owners are isolated; URLs, posting text
 * and CV content never reach logs or the audit trail (canary).
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
  JobPostingAcceptedSchema,
  JobPostingDetailSchema,
  JobPostingSummarySchema,
  PGBOSS_SCHEMA_NAME,
  QUEUES,
  TailoringBatchAcceptedSchema,
  paginated,
  type JobPostingExtracted,
  type MatchReport,
  type QueueName,
  type TailoredCvContent,
} from "@linkedin-ops/contracts";
import {
  createPrismaClient,
  deriveCsrfToken,
  hashSessionSecret,
  newId,
  PrismaJobPostingStore,
  validateRuntimeEnv,
  type PrismaClient,
  type RuntimeEnv,
} from "@linkedin-ops/domain";
import { PgBoss } from "pg-boss";
import supertest from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";
import { configureApp, createFastifyAdapter } from "../src/app.factory.js";
import { CAREER_RATE_LIMITS, DEFAULT_CAREER_RATE_LIMITS } from "../src/career/cv-base.service.js";
import { CV_EXTRACT_QUEUE, PgBossCareerQueue } from "../src/career/career.queue.js";
import { REQUESTED_WITH_VALUE } from "../src/common/route-access.guard.js";
import { createLogger } from "../src/logging/logger.js";
import { fictitiousCvStructured } from "./fixtures/cv-structured.js";
import { APP_BASE_URL, LogCapture, cookieHeader, mutationHeaders } from "./helpers.js";

const POSTGRES_IMAGE =
  "postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24";
const DOMAIN_ROOT = fileURLToPath(new URL("../../../packages/domain", import.meta.url));
const PRISMA_BIN = fileURLToPath(
  new URL("../../../packages/domain/node_modules/.bin/prisma", import.meta.url),
);
const BATCH_LIMIT = 30;

const URL_MARKER = "CANARIOURL0000";
const TEXT_MARKER = "CANARIO-VAGA-0000";
const CV_MARKER = "CANARIO-CV-0000";
const POSTING_TEXT =
  `Senior Backend Engineer at Fictional Corp. 5+ years of TypeScript. ${TEXT_MARKER} `.repeat(4);

const JOB: JobPostingExtracted = {
  language: "en",
  languageDetected: "en",
  title: "Senior Backend Engineer",
  company: "Fictional Corp",
  location: null,
  workMode: "remote",
  seniority: "Senior",
  requirements: [
    {
      id: "req-1",
      kind: "mandatory",
      category: "technical",
      text: "5+ years with TypeScript",
      evidence: "5+ years of TypeScript",
    },
  ],
  keywords: ["TypeScript"],
};

const TAILORED: TailoredCvContent = {
  language: "en",
  summary: {
    segments: [
      {
        segmentId: "seg-1",
        text: `Engineer focused on distributed systems. ${CV_MARKER}`,
        provenance: "rewritten",
        sourceCvItemIds: ["summary"],
        targetRequirementIds: [],
        additionNote: null,
      },
    ],
  },
  experiences: [],
  skills: { technical: { segments: [] }, behavioral: { segments: [] } },
  educationIds: [],
  certificationIds: [],
  languageIds: [],
};

const REPORT: MatchReport = {
  schemaVersion: "1.0",
  scoringVersion: "1.0.0",
  baseScore: 64,
  jobLanguage: "en",
  cvLanguage: "en",
  requirements: [],
  added: [],
  humanizer: {
    rulesVersion: "cv-banned-phrases@1.0.0",
    passed: true,
    regenerations: 0,
    failedRuleIds: [],
    revertedSegmentIds: [],
  },
  warnings: [],
};

const GENERATION = {
  model: "gpt-test",
  engineVersion: "0.4.0",
  promptVersions: {
    "cv-tailor": "1.0.0",
    "cv-humanize": "1.0.0",
    "cv-competency-lexicon": "1.0.1",
  },
};

let container: StartedPostgreSqlContainer | undefined;
let prisma: PrismaClient;
let app: NestFastifyApplication;
let request: ReturnType<typeof supertest>;
let env: RuntimeEnv;
let boss: PgBoss;
let producer: PgBossCareerQueue;
let worker: PrismaJobPostingStore;
const logs = new LogCapture();

interface Actor {
  userId: string;
  cookie: string;
  csrfToken: string;
}

interface JobRow {
  id: string;
  name: string;
  data: Record<string, unknown>;
  groupId: string | null;
  singletonKey: string | null;
  retryLimit: number;
  deadLetter: string | null;
}

/** Career job rows in pg-boss's own table (plain SQL, not through pg-boss). */
async function jobsOf(postingId: string): Promise<JobRow[]> {
  return prisma.$queryRawUnsafe<JobRow[]>(
    `SELECT "id"::text AS "id", "name", "data", "group_id" AS "groupId", "singleton_key" AS "singletonKey",
            "retry_limit" AS "retryLimit", "dead_letter" AS "deadLetter"
       FROM "${PGBOSS_SCHEMA_NAME}"."job" WHERE "data"->>'jobPostingId' = $1 ORDER BY "created_on"`,
    postingId,
  );
}

async function careerJobCount(): Promise<number> {
  const [row] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT count(*) AS "count" FROM "${PGBOSS_SCHEMA_NAME}"."job"
      WHERE "name" IN ('job.fetch', 'cv.tailor')`,
  );
  return Number(row?.count ?? 0);
}

async function newActor(options: { withCv?: boolean } = { withCv: true }): Promise<Actor> {
  const userId = newId();
  const sessionId = newId();
  await prisma.user.create({
    data: { id: userId, email: `jobs-${userId}@example.test`, passwordHash: "x", name: "Owner" },
  });
  const cookie = randomBytes(32).toString("base64url");
  await prisma.session.create({
    data: {
      id: sessionId,
      userId,
      secretHash: hashSessionSecret(cookie),
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  });
  if (options.withCv !== false) await activateCv(userId);
  return { userId, cookie, csrfToken: deriveCsrfToken(env.sessionSecret, sessionId) };
}

/** A confirmed CV base version that becomes the active one (the CV flow has its own suite). */
async function activateCv(userId: string): Promise<string> {
  const latest = await prisma.cvBase.aggregate({ where: { userId }, _max: { version: true } });
  await prisma.cvBase.updateMany({ where: { userId }, data: { isActive: false } });
  const now = new Date();
  const row = await prisma.cvBase.create({
    data: {
      id: newId(),
      userId,
      version: (latest._max.version ?? 0) + 1,
      status: "READY",
      content: fictitiousCvStructured(CV_MARKER),
      isActive: true,
      confirmedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  });
  return row.id;
}

function post(actor: Actor, path: string, body: object = {}) {
  return request
    .post(`/api/v1${path}`)
    .set(mutationHeaders({ cookie: cookieHeader(actor.cookie) }))
    .send(body);
}

function get(actor: Actor, path: string) {
  return request.get(`/api/v1${path}`).set("cookie", cookieHeader(actor.cookie));
}

function remove(actor: Actor, path: string) {
  return request
    .delete(`/api/v1${path}`)
    .set(mutationHeaders({ cookie: cookieHeader(actor.cookie) }))
    .send({});
}

const link = (n: number) => `https://www.linkedin.com/jobs/view/${n}/?trk=${URL_MARKER}`;

async function submit(actor: Actor, urls: string[]) {
  const res = await post(actor, "/career/batches", { urls }).expect(202);
  return TailoringBatchAcceptedSchema.parse(res.body);
}

/** Meta of a job of the posting's current cycle (`attempt` as stored; 1 for a posting that is gone). */
async function jobMeta(postingId: string) {
  const row = await prisma.jobPosting.findUnique({
    where: { id: postingId },
    select: { attempt: true },
  });
  return { jobId: `job-${newId()}`, correlationId: `corr-${newId()}`, attempt: row?.attempt ?? 1 };
}

/** The worker's side of one posting, from `FETCHING` to `READY`, through the real producer. */
async function runPipeline(postingId: string): Promise<void> {
  const meta = await jobMeta(postingId);
  await worker.saveFetchedText(postingId, POSTING_TEXT, meta);
  await worker.completeExtraction(
    postingId,
    {
      job: JOB,
      rawText: POSTING_TEXT,
      droppedRequirementCount: 0,
      injectionSuspected: false,
      injectionEvidence: null,
      generation: { ...GENERATION, promptVersions: { "job-extract": "1.0.0" } },
    },
    meta,
  );
  const input = await worker.loadForTailoring(postingId, meta);
  expect(input).not.toBeNull();
  await worker.completeTailoring(
    postingId,
    { cvBaseId: input!.cvBaseId, content: TAILORED, report: REPORT, generation: GENERATION },
    meta,
  );
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
  // What the worker does at boot: install the pgboss schema and provision the career queues (+ DLQs).
  boss = new PgBoss({ connectionString: databaseUrl, schema: PGBOSS_SCHEMA_NAME });
  await boss.start();
  for (const name of ["cv.extract", "job.fetch", "cv.tailor"] as const satisfies QueueName[]) {
    const definition = QUEUES[name];
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
  }
  prisma = createPrismaClient({ connectionString: databaseUrl });
  const logger = createLogger({ level: "info", pretty: false, stream: logs.stream });
  producer = new PgBossCareerQueue(databaseUrl, logger);
  await producer.onApplicationBootstrap();
  expect(producer.ready).toBe(true);
  worker = new PrismaJobPostingStore(prisma, async (db, job) => {
    const payload = {
      schemaVersion: 1 as const,
      correlationId: `corr-${newId()}`,
      requestedBy: { type: "SYSTEM" as const, id: "worker" },
      jobPostingId: job.jobPostingId,
      attempt: job.attempt,
    };
    return (await producer.enqueueTailor(payload, db)).jobId;
  });
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forRoot({ env, logger })],
  })
    .overrideProvider(CV_EXTRACT_QUEUE)
    .useValue(producer)
    .overrideProvider(CAREER_RATE_LIMITS)
    .useValue({ ...DEFAULT_CAREER_RATE_LIMITS, batchPerUser: BATCH_LIMIT })
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
  await producer?.onApplicationShutdown();
  await boss?.stop({ graceful: false, close: true });
  await prisma?.$disconnect();
  await container?.stop();
});

describe("POST /career/batches", () => {
  it("creates one FETCHING posting per distinct link and one job.fetch each, grouped by domain", async () => {
    const actor = await newActor();
    const res = await post(actor, "/career/batches", {
      urls: [
        link(1),
        "https://linkedin.com/jobs/search/?currentJobId=1",
        "https://lnkd.in/abc123",
        `https://acme.gupy.io/jobs/7?utm_source=${URL_MARKER}`,
      ],
    }).expect(202);
    expect(res.headers.location).toBe("/api/v1/career/jobs");
    expect(res.headers["cache-control"]).toBe("no-store");
    const body = TailoringBatchAcceptedSchema.parse(res.body);
    expect(body).toMatchObject({ id: body.batchId, status: "FETCHING", duplicatesMerged: 1 });
    expect(body.jobId).toBe(body.jobIds[0]);
    expect(body.postings.map((p) => [p.url, p.source])).toEqual([
      ["https://www.linkedin.com/jobs/view/1/", "LINKEDIN"],
      ["https://lnkd.in/abc123", "LINKEDIN"],
      ["https://acme.gupy.io/jobs/7", "OTHER"],
    ]);

    const jobs = (await Promise.all(body.postings.map((p) => jobsOf(p.id)))).flat();
    expect(jobs.map((job) => job.id)).toEqual(body.jobIds);
    expect(jobs.map((job) => [job.name, job.groupId])).toEqual([
      ["job.fetch", "linkedin.com"],
      ["job.fetch", "linkedin.com"],
      ["job.fetch", "gupy.io"],
    ]);
    expect(jobs[0]).toMatchObject({
      data: {
        schemaVersion: 1,
        correlationId: res.headers["x-correlation-id"],
        requestedBy: { type: "USER", id: actor.userId },
        jobPostingId: body.postings[0]!.id,
        attempt: 1,
      },
      singletonKey: body.postings[0]!.id,
      retryLimit: QUEUES["job.fetch"].retryLimit,
      deadLetter: QUEUES["job.fetch"].deadLetter,
    });
    // The payload carries ids only: the link stays in job_postings.
    expect(JSON.stringify(jobs)).not.toContain("linkedin.com/jobs");
  });

  it("accepts 20 links and refuses 0 or 21, before anything is stored", async () => {
    const actor = await newActor();
    const twenty = Array.from({ length: 20 }, (_, i) => link(100 + i));
    expect((await submit(actor, twenty)).postings).toHaveLength(20);
    const before = await careerJobCount();
    for (const urls of [[], [...twenty, link(999)]]) {
      const res = await post(actor, "/career/batches", { urls }).expect(400);
      expect(res.body.code).toBe("VALIDATION_FAILED");
    }
    for (const bad of [
      "http://169.254.169.254/latest",
      "https://u:p@example.com/job",
      "file:///etc",
    ]) {
      await post(actor, "/career/batches", { urls: [bad] }).expect(400);
    }
    expect(await careerJobCount()).toBe(before);
    expect(await prisma.tailoringBatch.count({ where: { userId: actor.userId } })).toBe(1);
  });

  it("never queues a LinkedIn link that is not a job view: FAILED/FETCH_BLOCKED, no job (ADR-0008 §1)", async () => {
    const actor = await newActor();
    const before = await careerJobCount();
    const only = TailoringBatchAcceptedSchema.parse(
      (
        await post(actor, "/career/batches", {
          urls: ["https://www.linkedin.com/in/fulano/", "https://www.linkedin.com/feed/"],
        }).expect(202)
      ).body,
    );
    expect(only).toMatchObject({ status: "FAILED", jobId: null, jobIds: [], blocked: 2 });
    expect(only.postings.map((p) => [p.status, p.failureReason])).toEqual([
      ["FAILED", "FETCH_BLOCKED"],
      ["FAILED", "FETCH_BLOCKED"],
    ]);
    expect(await careerJobCount()).toBe(before);
    const id = only.postings[0]!.id;
    const retry = await post(actor, `/career/jobs/${id}/retry`).expect(422);
    expect(retry.body.code).toBe("JOB_POSTING_URL_REJECTED");
    expect(await careerJobCount()).toBe(before);
    await post(actor, `/career/jobs/${id}/text`, { text: POSTING_TEXT }).expect(202);
    expect((await jobsOf(id)).map((job) => job.groupId)).toEqual(["pasted"]);
  });

  it("answers 422 for a link that outgrows the bound once normalized, before the transaction", async () => {
    const actor = await newActor();
    const base = "https://acme.gupy.io/";
    const grows = `${base}${"é".repeat(2040 - base.length)}`;
    const before = await careerJobCount();
    const res = await post(actor, "/career/batches", { urls: [link(60), grows] }).expect(422);
    expect(res.body.code).toBe("JOB_POSTING_URL_REJECTED");
    expect(res.body.detail).toContain("posição 2");
    expect(JSON.stringify(res.body)).not.toContain("gupy");
    expect(await prisma.tailoringBatch.count({ where: { userId: actor.userId } })).toBe(0);
    expect(await careerJobCount()).toBe(before);
    expect(logs.text).not.toContain("Failing row");
  });

  it("refuses a batch without a confirmed CV base (412) and stores nothing", async () => {
    const actor = await newActor({ withCv: false });
    const before = await careerJobCount();
    const res = await post(actor, "/career/batches", { urls: [link(5)] }).expect(412);
    expect(res.body.code).toBe("CV_BASE_REQUIRED");
    expect(await prisma.jobPosting.count({ where: { userId: actor.userId } })).toBe(0);
    expect(await careerJobCount()).toBe(before);
  });

  it("enforces N4 and the session on every mutation", async () => {
    const actor = await newActor();
    const id = (await submit(actor, [link(6)])).postings[0]!.id;
    const routes: [string, object][] = [
      ["/career/batches", { urls: [link(7)] }],
      [`/career/jobs/${id}/retry`, {}],
      [`/career/jobs/${id}/text`, { text: POSTING_TEXT }],
    ];
    for (const [path, body] of routes) {
      await request
        .post(`/api/v1${path}`)
        .set({ origin: APP_BASE_URL, cookie: cookieHeader(actor.cookie) })
        .send(body)
        .expect(403);
      await request
        .post(`/api/v1${path}`)
        .set({ "x-requested-with": REQUESTED_WITH_VALUE, cookie: cookieHeader(actor.cookie) })
        .send(body)
        .expect(403);
      await request.post(`/api/v1${path}`).set(mutationHeaders()).send(body).expect(401);
    }
    await request
      .delete(`/api/v1/career/jobs/${id}`)
      .set({ cookie: cookieHeader(actor.cookie) })
      .expect(403);
    await request.get("/api/v1/career/jobs").expect(401);
    expect((await jobsOf(id)).map((job) => job.name)).toEqual(["job.fetch"]);
  });
});

describe("GET /career/jobs and /career/jobs/{id}", () => {
  it("serves the posting through the pipeline: list with status, detail with tailoring", async () => {
    const actor = await newActor();
    const batch = await submit(actor, [link(10), link(11)]);
    const [first, second] = batch.postings.map((p) => p.id) as [string, string];

    const fetching = JobPostingDetailSchema.parse(
      (await get(actor, `/career/jobs/${first}`).expect(200)).body,
    );
    expect(fetching).toMatchObject({
      status: "FETCHING",
      extracted: null,
      tailoring: null,
      title: null,
    });

    await runPipeline(first);
    expect((await jobsOf(first)).map((job) => [job.name, job.groupId])).toEqual([
      ["job.fetch", "linkedin.com"],
      ["cv.tailor", null],
    ]);
    const ready = JobPostingDetailSchema.parse(
      (await get(actor, `/career/jobs/${first}`).expect(200)).body,
    );
    expect(ready).toMatchObject({
      status: "READY",
      title: "Senior Backend Engineer",
      company: "Fictional Corp",
      baseScore: 64,
      extracted: JOB,
      tailoring: { generatedWithPreviousCv: false, content: TAILORED, report: REPORT },
    });

    const page = paginated(JobPostingSummarySchema).parse(
      (await get(actor, "/career/jobs?limit=1").expect(200)).body,
    );
    expect(page.items.map((p) => [p.id, p.status])).toEqual([[second, "FETCHING"]]);
    expect(page.nextCursor).toBe(second);
    const next = paginated(JobPostingSummarySchema).parse(
      (await get(actor, `/career/jobs?limit=1&cursor=${page.nextCursor}`).expect(200)).body,
    );
    expect(next.items.map((p) => [p.id, p.baseScore])).toEqual([[first, 64]]);
    // The list never carries the tailored CV.
    expect(JSON.stringify(page)).not.toContain(CV_MARKER);

    // A newer CV base: the detail flags that the tailoring used the previous one.
    await activateCv(actor.userId);
    const stale = JobPostingDetailSchema.parse(
      (await get(actor, `/career/jobs/${first}`).expect(200)).body,
    );
    expect(stale.tailoring?.generatedWithPreviousCv).toBe(true);
  });

  it("hides other owners' postings (404) and validates the cursor", async () => {
    const owner = await newActor();
    const stranger = await newActor();
    const id = (await submit(owner, [link(20)])).postings[0]!.id;
    expect((await get(stranger, `/career/jobs/${id}`).expect(404)).body.code).toBe("NOT_FOUND");
    await post(stranger, `/career/jobs/${id}/retry`).expect(404);
    await post(stranger, `/career/jobs/${id}/text`, { text: POSTING_TEXT }).expect(404);
    await remove(stranger, `/career/jobs/${id}`).expect(404);
    expect((await get(stranger, "/career/jobs").expect(200)).body).toEqual({
      items: [],
      nextCursor: null,
    });
    await get(owner, "/career/jobs?cursor=abc").expect(400);
    await get(owner, `/career/jobs/not-a-uuid`).expect(400);
  });
});

describe("POST /career/jobs/{id}/text and /retry, DELETE /career/jobs/{id}", () => {
  it("pastes text into a failed posting: 202, PASTED, job.fetch in the pasted group", async () => {
    const actor = await newActor();
    const id = (await submit(actor, [link(30)])).postings[0]!.id;
    const busy = await post(actor, `/career/jobs/${id}/text`, { text: POSTING_TEXT }).expect(409);
    expect(busy.body.code).toBe("JOB_POSTING_INVALID_TRANSITION");

    await worker.markFailed(id, "fetch_blocked", await jobMeta(id));
    const res = await post(actor, `/career/jobs/${id}/text`, { text: POSTING_TEXT }).expect(202);
    expect(res.headers.location).toBe(`/api/v1/career/jobs/${id}`);
    const accepted = JobPostingAcceptedSchema.parse(res.body);
    expect(accepted).toMatchObject({ id, status: "FETCHING", posting: { source: "PASTED" } });
    const jobs = await jobsOf(id);
    expect(jobs.at(-1)).toMatchObject({ id: accepted.jobId, name: "job.fetch", groupId: "pasted" });
    expect(JSON.stringify(jobs)).not.toContain(TEXT_MARKER);
    expect(await worker.loadForFetch(id, await jobMeta(id))).toEqual({
      source: { kind: "pasted", text: POSTING_TEXT.trim() },
      fetchedText: null,
    });
    await post(actor, `/career/jobs/${id}/text`, { text: "curto" }).expect(400);
  });

  it("retries a READY posting by re-tailoring only, and a failed fetch by fetching again", async () => {
    const actor = await newActor();
    const batch = await submit(actor, [link(40), "https://acme.gupy.io/jobs/41"]);
    const [ready, failed] = batch.postings.map((p) => p.id) as [string, string];
    await runPipeline(ready);
    await worker.markFailed(failed, "fetch", await jobMeta(failed));

    const retried = JobPostingAcceptedSchema.parse(
      (await post(actor, `/career/jobs/${ready}/retry`).expect(202)).body,
    );
    expect(retried.status).toBe("ANALYZING");
    expect((await jobsOf(ready)).at(-1)).toMatchObject({
      id: retried.jobId,
      name: "cv.tailor",
      // A new processing cycle: the cv.tailor of the first one can no longer act on the posting.
      data: expect.objectContaining({ attempt: 2 }),
    });
    await post(actor, `/career/jobs/${ready}/retry`).expect(409);

    const refetch = JobPostingAcceptedSchema.parse(
      (await post(actor, `/career/jobs/${failed}/retry`).expect(202)).body,
    );
    expect(refetch).toMatchObject({ status: "FETCHING", posting: { failureReason: null } });
    expect((await jobsOf(failed)).at(-1)).toMatchObject({ name: "job.fetch", groupId: "gupy.io" });
  });

  it("deletes the posting with its tailored CV (204); the batch goes with its last posting", async () => {
    const actor = await newActor();
    const batch = await submit(actor, [link(50)]);
    const id = batch.postings[0]!.id;
    await runPipeline(id);
    await remove(actor, `/career/jobs/${id}`).expect(204);
    await get(actor, `/career/jobs/${id}`).expect(404);
    expect(await prisma.tailoredCv.count({ where: { jobPostingId: id } })).toBe(0);
    expect(await prisma.tailoringBatch.count({ where: { id: batch.batchId } })).toBe(0);
    // The queued jobs of the deleted posting exit quietly.
    expect(await worker.loadForFetch(id, await jobMeta(id))).toBeNull();
    expect(await worker.loadForTailoring(id, await jobMeta(id))).toBeNull();
  });
});

describe("personal data", () => {
  it("never logs or audits URLs, posting text or CV content", async () => {
    const events = await prisma.auditEvent.findMany({
      where: { entityType: { in: ["job_posting", "tailoring_batch"] } },
    });
    expect(events.length).toBeGreaterThan(10);
    for (const haystack of [logs.text, JSON.stringify(events)]) {
      for (const marker of [
        URL_MARKER,
        TEXT_MARKER,
        CV_MARKER,
        "gupy.io/jobs",
        "linkedin.com/jobs",
      ]) {
        expect(haystack).not.toContain(marker);
      }
    }
  });
});
