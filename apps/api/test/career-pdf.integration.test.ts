/**
 * `GET /career/jobs/{id}/pdf` against a real PostgreSQL (career PR 3c, spec 2026-10-22 §5 item 7, D3/D6,
 * ADR-0009): session required, owners isolated (`404`), `READY` only, rendered from the CV base VERSION the
 * tailoring used (never the active one), `Content-Disposition: attachment` with the normalized name,
 * `Cache-Control: no-store`, rate limited, a stale reference → `409 TAILORED_CV_STALE` audited by id only,
 * and no CV content in logs (canary). Rows are seeded directly: the pipeline has its own suite.
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
import type {
  CvStructured,
  JobPostingExtracted,
  JobPostingStatus,
  MatchReport,
  TailoredCvContent,
} from "@linkedin-ops/contracts";
import {
  createPrismaClient,
  hashSessionSecret,
  jobPostingUrlHash,
  newId,
  validateRuntimeEnv,
  type PrismaClient,
  type RuntimeEnv,
} from "@linkedin-ops/domain";
import supertest from "supertest";
import { extractText, getDocumentProxy } from "unpdf";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";
import { configureApp, createFastifyAdapter } from "../src/app.factory.js";
import { CAREER_RATE_LIMITS, DEFAULT_CAREER_RATE_LIMITS } from "../src/career/cv-base.service.js";
import { CV_EXTRACT_QUEUE } from "../src/career/career.queue.js";
import { createLogger } from "../src/logging/logger.js";
import { fictitiousCvStructured } from "./fixtures/cv-structured.js";
import { APP_BASE_URL, LogCapture, cookieHeader } from "./helpers.js";

const POSTGRES_IMAGE =
  "postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24";
const DOMAIN_ROOT = fileURLToPath(new URL("../../../packages/domain", import.meta.url));
const PRISMA_BIN = fileURLToPath(
  new URL("../../../packages/domain/node_modules/.bin/prisma", import.meta.url),
);
const PDF_LIMIT = 5;

const CV_MARKER = "CANARIO-CV-PDF-0000";
const SEGMENT_MARKER = "CANARIO-SEGMENTO-0000";

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

/** Tailored against `fictitiousCvStructured` (exp-1, edu-1, lang-1). */
const TAILORED: TailoredCvContent = {
  language: "en",
  summary: {
    segments: [
      {
        segmentId: "seg-1",
        text: `Engineer focused on distributed systems. ${SEGMENT_MARKER}`,
        provenance: "rewritten",
        sourceCvItemIds: ["summary"],
        targetRequirementIds: [],
        additionNote: null,
      },
    ],
  },
  experiences: [
    {
      cvExperienceId: "exp-1",
      bullets: {
        segments: [
          {
            segmentId: "seg-2",
            text: "Led the queue migration to PostgreSQL.",
            provenance: "rewritten",
            sourceCvItemIds: ["exp-1-b-1"],
            targetRequirementIds: [],
            additionNote: null,
          },
        ],
      },
      skills: { segments: [] },
    },
  ],
  skills: { technical: { segments: [] }, behavioral: { segments: [] } },
  educationIds: ["edu-1"],
  certificationIds: [],
  languageIds: ["lang-1"],
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

let container: StartedPostgreSqlContainer | undefined;
let prisma: PrismaClient;
let app: NestFastifyApplication;
let request: ReturnType<typeof supertest>;
let env: RuntimeEnv;
const logs = new LogCapture();

interface Actor {
  userId: string;
  cookie: string;
}

async function newActor(): Promise<Actor> {
  const userId = newId();
  await prisma.user.create({
    data: { id: userId, email: `pdf-${userId}@example.test`, passwordHash: "x", name: "Owner" },
  });
  const cookie = randomBytes(32).toString("base64url");
  await prisma.session.create({
    data: {
      id: newId(),
      userId,
      secretHash: hashSessionSecret(cookie),
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  });
  return { userId, cookie };
}

/** A confirmed CV base version that becomes the active one. */
async function activateCv(userId: string, content: CvStructured): Promise<string> {
  const latest = await prisma.cvBase.aggregate({ where: { userId }, _max: { version: true } });
  await prisma.cvBase.updateMany({ where: { userId }, data: { isActive: false } });
  const now = new Date();
  const row = await prisma.cvBase.create({
    data: {
      id: newId(),
      userId,
      version: (latest._max.version ?? 0) + 1,
      status: "READY",
      content,
      isActive: true,
      confirmedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  });
  return row.id;
}

/** A posting in `status`, tailored against `cvBaseId` when `READY`. */
async function seedPosting(
  actor: Actor,
  cvBaseId: string,
  options: { status?: JobPostingStatus; job?: JobPostingExtracted; tailored?: object } = {},
): Promise<string> {
  const status = options.status ?? "READY";
  const now = new Date();
  const batchId = newId();
  await prisma.tailoringBatch.create({
    data: { id: batchId, userId: actor.userId, cvBaseId, createdAt: now },
  });
  const id = newId();
  const url = `https://jobs.example.test/${id}`;
  await prisma.jobPosting.create({
    data: {
      id,
      userId: actor.userId,
      batchId,
      url,
      urlHash: jobPostingUrlHash(url),
      source: "OTHER",
      status,
      ...(status === "FAILED" ? { failureReason: "FETCH" as const } : {}),
      extracted: status === "FETCHING" ? undefined : (options.job ?? JOB),
      ...(status === "ANALYZING" ? { pageText: "Fictitious posting text." } : {}),
      createdAt: now,
      updatedAt: now,
    },
  });
  if (status === "READY") {
    await prisma.tailoredCv.create({
      data: {
        id: newId(),
        userId: actor.userId,
        jobPostingId: id,
        cvBaseId,
        content: options.tailored ?? TAILORED,
        matchReport: REPORT,
        generation: { model: "gpt-test", engineVersion: "0.4.0", promptVersions: {} },
        createdAt: now,
        updatedAt: now,
      },
    });
  }
  return id;
}

function download(actor: Actor | null, id: string) {
  const req = request.get(`/api/v1/career/jobs/${id}/pdf`);
  if (actor) req.set("cookie", cookieHeader(actor.cookie));
  return req.buffer(true).parse((res, callback) => {
    const chunks: Buffer[] = [];
    res.on("data", (chunk: Buffer) => chunks.push(chunk));
    res.on("end", () => callback(null, Buffer.concat(chunks)));
  });
}

async function pdfText(body: Buffer): Promise<string> {
  const { text } = await extractText(await getDocumentProxy(new Uint8Array(body)), {
    mergePages: true,
  });
  return text.replace(/\s+/g, " ");
}

function problemOf(body: Buffer): { code: string; detail?: string; status: number } {
  return JSON.parse(body.toString("utf8")) as { code: string; detail?: string; status: number };
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
  prisma = createPrismaClient({ connectionString: databaseUrl });
  const logger = createLogger({ level: "info", pretty: false, stream: logs.stream });
  // The download never enqueues: a producer that is never ready proves it.
  const noQueue = {
    ensureReady: () => Promise.reject(new Error("no queue in this suite")),
    enqueue: () => Promise.reject(new Error("no queue in this suite")),
    enqueueFetch: () => Promise.reject(new Error("no queue in this suite")),
    enqueueTailor: () => Promise.reject(new Error("no queue in this suite")),
  };
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forRoot({ env, logger })],
  })
    .overrideProvider(CV_EXTRACT_QUEUE)
    .useValue(noQueue)
    .overrideProvider(CAREER_RATE_LIMITS)
    .useValue({ ...DEFAULT_CAREER_RATE_LIMITS, pdfPerUser: PDF_LIMIT })
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
  await prisma?.$disconnect();
  await container?.stop();
});

describe("GET /career/jobs/{id}/pdf", () => {
  it("downloads the tailored CV as an attachment, never cached, with selectable text", async () => {
    const actor = await newActor();
    const cvBaseId = await activateCv(actor.userId, fictitiousCvStructured(CV_MARKER));
    const id = await seedPosting(actor, cvBaseId);

    const res = await download(actor, id).expect(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toBe(
      'attachment; filename="CV-Ana-Exemplo-da-Silva-Fictional-Corp-Senior-Backend-Engineer.pdf"',
    );
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    const body = res.body as Buffer;
    expect(Number(res.headers["content-length"])).toBe(body.length);
    expect(body.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    const text = await pdfText(body);
    expect(text).toContain("Ana Exemplo da Silva");
    expect(text).toContain(SEGMENT_MARKER);
    expect(text).toContain("Engenheira Sênior — Empresa Fictícia S.A.");
    expect(text).toContain("EXPERIENCE");
  });

  it("renders from the CV base version the tailoring used, never the active one", async () => {
    const actor = await newActor();
    const v1 = fictitiousCvStructured(CV_MARKER);
    v1.experiences[0]!.company = "Empresa Versao Um";
    const v1Id = await activateCv(actor.userId, v1);
    const id = await seedPosting(actor, v1Id);
    const v2 = fictitiousCvStructured(CV_MARKER);
    v2.experiences[0]!.company = "Empresa Versao Dois";
    v2.contact.name = "Outro Nome Ativo";
    await activateCv(actor.userId, v2);

    const text = await pdfText((await download(actor, id).expect(200)).body as Buffer);
    expect(text).toContain("Empresa Versao Um");
    expect(text).not.toContain("Empresa Versao Dois");
    expect(text).not.toContain("Outro Nome Ativo");
  });

  it("requires a session and isolates owners", async () => {
    const owner = await newActor();
    const other = await newActor();
    const id = await seedPosting(owner, await activateCv(owner.userId, fictitiousCvStructured()));

    expect(problemOf((await download(null, id).expect(401)).body as Buffer).code).toBe(
      "AUTH_REQUIRED",
    );
    const foreign = await download(other, id).expect(404);
    expect(foreign.headers["content-type"]).toMatch(/^application\/problem\+json/);
    expect(problemOf(foreign.body as Buffer).code).toBe("NOT_FOUND");
    await download(owner, newId()).expect(404);
    expect(problemOf((await download(owner, "nope").expect(400)).body as Buffer).code).toBe(
      "VALIDATION_FAILED",
    );
  });

  it("serves only READY postings", async () => {
    const actor = await newActor();
    const cvBaseId = await activateCv(actor.userId, fictitiousCvStructured());
    for (const status of ["FETCHING", "ANALYZING", "FAILED"] as const) {
      const id = await seedPosting(actor, cvBaseId, { status });
      const res = await download(actor, id).expect(409);
      expect(problemOf(res.body as Buffer)).toMatchObject({
        code: "TAILORED_CV_NOT_READY",
        detail: "O CV adaptado desta vaga ainda não está pronto",
      });
    }
  });

  it("answers 409 TAILORED_CV_STALE for a dangling base CV item, auditing the id only", async () => {
    const actor = await newActor();
    const cvBaseId = await activateCv(actor.userId, fictitiousCvStructured(CV_MARKER));
    const id = await seedPosting(actor, cvBaseId, {
      tailored: { ...TAILORED, educationIds: ["edu-404"] },
    });

    const res = await download(actor, id).expect(409);
    expect(problemOf(res.body as Buffer)).toMatchObject({
      code: "TAILORED_CV_STALE",
      detail: "O CV adaptado referencia itens que não existem mais no CV base; reprocesse a vaga",
    });
    const events = await prisma.auditEvent.findMany({
      where: { userId: actor.userId, action: "tailored_cv.stale" },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      entityType: "job_posting",
      entityId: id,
      actorType: "USER",
      after: { missingItemId: "edu-404" },
    });
    expect(JSON.stringify(events)).not.toContain(CV_MARKER);
    expect(JSON.stringify(events)).not.toContain(SEGMENT_MARKER);
  });

  it("keeps hostile posting fields out of the Content-Disposition header", async () => {
    const actor = await newActor();
    const cvBaseId = await activateCv(actor.userId, fictitiousCvStructured());
    const id = await seedPosting(actor, cvBaseId, {
      job: { ...JOB, company: 'Evil"\r\nSet-Cookie: pwned=1; x=', title: "../../etc/passwd" },
    });

    const res = await download(actor, id).expect(200);
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(res.headers["content-disposition"]).toBe(
      'attachment; filename="CV-Ana-Exemplo-da-Silva-Evil-Set-Cookie-pwned-1-x-etc-passwd.pdf"',
    );
  });

  it("is rate limited per user with Retry-After", async () => {
    const actor = await newActor();
    const id = await seedPosting(actor, await activateCv(actor.userId, fictitiousCvStructured()));
    for (let i = 0; i < PDF_LIMIT; i += 1) await download(actor, id).expect(200);

    const res = await download(actor, id).expect(429);
    expect(problemOf(res.body as Buffer).code).toBe("RATE_LIMITED");
    expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("never logs CV content", () => {
    expect(logs.lines.length).toBeGreaterThan(0);
    expect(logs.text).not.toContain(CV_MARKER);
    expect(logs.text).not.toContain(SEGMENT_MARKER);
    expect(logs.text).not.toContain("Ana Exemplo");
    expect(logs.text).not.toContain("Fictional Corp");
  });
});
