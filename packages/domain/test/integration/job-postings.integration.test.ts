/**
 * Career PR 3b against a real PostgreSQL: `PrismaJobPostings` (API side) and `PrismaJobPostingStore` (worker
 * side) through a whole posting lifecycle. The enqueue callbacks write to a scratch table through the
 * `SqlExecutor` they receive, so a test sees exactly what pg-boss's `send({ db })` would commit: the job row
 * exists only if the state change commits (ADR-0002 §3). The real pg-boss producer is covered by the API
 * integration test.
 *
 * Without Docker, point `INTEGRATION_DATABASE_URL` at a server the user may create databases on; this file
 * then creates its own empty database there.
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient, type PrismaClient } from "../../src/client.js";
import { CV_EXTRACTION_STALE_MS } from "../../src/career/cv-bases.js";
import {
  CvBaseRequiredError,
  JOB_POSTING_FAILED_TEXT_RETENTION_MS,
  JOB_POSTING_STALE_MS,
  JOB_POSTING_SWEEP_BATCH,
  JobPostingBusyError,
  JobPostingNotFoundError,
  JobPostingTextRequiredError,
  JobPostingUrlTooLongError,
  PrismaJobPostings,
  type CareerAuditMeta,
  type CvTailorEnqueue,
  type JobFetchEnqueue,
} from "../../src/career/job-postings.js";
import { PrismaJobPostingStore } from "../../src/career/prisma-job-posting-store.js";
import type {
  CareerFailureReason,
  JobPostingJobMeta,
  JobPostingStore,
} from "../../src/career/ports.js";
import type { SqlExecutor } from "../../src/career/transaction.js";
import { newId } from "../../src/ids.js";
import {
  cvStructured,
  jobPostingExtracted,
  matchReport,
  tailoredCvContent,
} from "../fixtures/career.js";

const PACKAGE_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const PRISMA_BIN = fileURLToPath(new URL("../../node_modules/.bin/prisma", import.meta.url));
const POSTGRES_IMAGE =
  "postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24";

const URL_MARKER = "CANARIOURL0000";
const TEXT_MARKER = "CANARIO-TEXTO-0000";
const POSTING_TEXT = `Senior Backend Engineer. 5+ years of TypeScript. ${TEXT_MARKER}`;
const GENERATION = {
  model: "gpt-test-1",
  engineVersion: "0.4.0",
  promptVersions: {
    "cv-tailor": "1.0.0",
    "cv-humanize": "1.0.0",
    "cv-competency-lexicon": "1.0.1",
  },
};

let container: StartedPostgreSqlContainer | undefined;
/** Server and name of the database this file created on `INTEGRATION_DATABASE_URL` (dropped afterwards). */
let created: { adminUrl: string; name: string } | undefined;
let prisma: PrismaClient;
let clock: Date;
let postings: PrismaJobPostings;
let failTailorEnqueue = false;
let store: PrismaJobPostingStore;

interface QueuedJob {
  name: string;
  postingId: string;
  groupId: string | null;
  attempt: number;
}

async function enqueueInto(db: SqlExecutor, job: QueuedJob): Promise<string> {
  const id = newId();
  await db.executeSql(
    `INSERT INTO "test_jobs" ("id", "name", "posting_id", "group_id", "attempt")
     VALUES ($1::uuid, $2, $3::uuid, $4, $5::int)`,
    [id, job.name, job.postingId, job.groupId, job.attempt],
  );
  return id;
}

const enqueueFetch: JobFetchEnqueue = (db, job) =>
  enqueueInto(db, {
    name: "job.fetch",
    postingId: job.jobPostingId,
    groupId: job.groupId,
    attempt: job.attempt,
  });

const enqueueTailor: CvTailorEnqueue = async (db, job) => {
  const id = await enqueueInto(db, {
    name: "cv.tailor",
    postingId: job.jobPostingId,
    groupId: null,
    attempt: job.attempt,
  });
  // After the insert: the rollback must take the job row away with the extraction.
  if (failTailorEnqueue) throw new Error("queue down after insert");
  return id;
};

/** Throws on the `n`-th call (1-based), after inserting its row. */
function failingFetchEnqueue(n: number): JobFetchEnqueue {
  let calls = 0;
  return async (db, job) => {
    calls += 1;
    const id = await enqueueFetch(db, job);
    if (calls === n) throw new Error("queue down after insert");
    return id;
  };
}

async function jobs(postingId?: string): Promise<QueuedJob[]> {
  const rows = await prisma.$queryRawUnsafe<QueuedJob[]>(
    `SELECT "name", "posting_id"::text AS "postingId", "group_id" AS "groupId", "attempt" FROM "test_jobs"
     ${postingId === undefined ? "" : `WHERE "posting_id" = '${postingId}'`} ORDER BY "seq"`,
  );
  return rows;
}

function userMeta(userId: string): CareerAuditMeta {
  return { correlationId: `req-${newId()}`, actor: { type: "USER", userId } };
}

/** Meta of a job of the posting's current cycle (`attempt` as stored; 1 for a posting that is gone). */
async function workerMeta(jobPostingId: string): Promise<JobPostingJobMeta> {
  const row = await prisma.jobPosting.findUnique({
    where: { id: jobPostingId },
    select: { attempt: true },
  });
  return { jobId: `job-${newId()}`, correlationId: `corr-${newId()}`, attempt: row?.attempt ?? 1 };
}

/** The worker port as the job of the posting's current cycle calls it. */
const current = {
  loadForFetch: async (id: string) => store.loadForFetch(id, await workerMeta(id)),
  saveFetchedText: async (id: string, text: string) =>
    store.saveFetchedText(id, text, await workerMeta(id)),
  completeExtraction: async (
    id: string,
    result: Parameters<JobPostingStore["completeExtraction"]>[1],
  ) => store.completeExtraction(id, result, await workerMeta(id)),
  loadForTailoring: async (id: string) => store.loadForTailoring(id, await workerMeta(id)),
  completeTailoring: async (
    id: string,
    result: Parameters<JobPostingStore["completeTailoring"]>[1],
  ) => store.completeTailoring(id, result, await workerMeta(id)),
  markFailed: async (id: string, reason: CareerFailureReason) =>
    store.markFailed(id, reason, await workerMeta(id)),
};

async function owner(): Promise<string> {
  const id = newId();
  await prisma.user.create({
    data: { id, email: `jobs-${id}@example.test`, passwordHash: "x", name: "Jobs owner" },
  });
  return id;
}

/** A new confirmed CV base version that becomes the active one. */
async function activateCv(userId: string): Promise<string> {
  const latest = await prisma.cvBase.aggregate({ where: { userId }, _max: { version: true } });
  await prisma.cvBase.updateMany({ where: { userId }, data: { isActive: false } });
  const row = await prisma.cvBase.create({
    data: {
      id: newId(),
      userId,
      version: (latest._max.version ?? 0) + 1,
      status: "READY",
      content: cvStructured(),
      isActive: true,
      confirmedAt: clock,
      createdAt: clock,
      updatedAt: clock,
    },
  });
  return row.id;
}

async function ownerWithCv(): Promise<{ userId: string; cvBaseId: string }> {
  const userId = await owner();
  return { userId, cvBaseId: await activateCv(userId) };
}

/** Drives one posting from `FETCHING` to `READY` through the worker port. */
async function runPipeline(id: string, cvTitle = "Senior Backend Engineer"): Promise<void> {
  expect(await current.loadForFetch(id)).not.toBeNull();
  await current.saveFetchedText(id, POSTING_TEXT);
  await current.completeExtraction(id, {
    job: jobPostingExtracted(cvTitle),
    rawText: POSTING_TEXT,
    droppedRequirementCount: 0,
    injectionSuspected: false,
    injectionEvidence: null,
    generation: {
      model: "gpt-test-1",
      engineVersion: "0.4.0",
      promptVersions: { "job-extract": "1.0.0" },
    },
  });
  const input = await current.loadForTailoring(id);
  expect(input).not.toBeNull();
  await current.completeTailoring(id, {
    cvBaseId: input!.cvBaseId,
    content: tailoredCvContent(),
    report: matchReport(),
    generation: GENERATION,
  });
}

async function auditOf(entityId: string) {
  return prisma.auditEvent.findMany({ where: { entityId }, orderBy: { createdAt: "asc" } });
}

async function batchOf(userId: string, urls: string[]) {
  return postings.createBatch(userId, urls, userMeta(userId), enqueueFetch);
}

beforeAll(async () => {
  let databaseUrl: string;
  const external = process.env.INTEGRATION_DATABASE_URL;
  if (external) {
    const name = `job_postings_${Date.now()}`;
    const admin = new pg.Client({ connectionString: external });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${name}"`);
    await admin.end();
    created = { adminUrl: external, name };
    const url = new URL(external);
    url.pathname = `/${name}`;
    databaseUrl = url.toString();
  } else {
    container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
    databaseUrl = container.getConnectionUri();
  }
  execFileSync(PRISMA_BIN, ["migrate", "deploy"], {
    cwd: PACKAGE_ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: ["ignore", "pipe", "pipe"],
  });
  prisma = createPrismaClient({ connectionString: databaseUrl, maxConnections: 4 });
  await prisma.$executeRawUnsafe(
    `CREATE TABLE "test_jobs" ("seq" BIGSERIAL PRIMARY KEY, "id" UUID NOT NULL, "name" TEXT NOT NULL,
       "posting_id" UUID NOT NULL, "group_id" TEXT, "attempt" INT NOT NULL)`,
  );
  postings = new PrismaJobPostings(prisma, () => clock);
  store = new PrismaJobPostingStore(prisma, enqueueTailor, () => clock);
});

beforeEach(() => {
  clock = new Date("2026-10-22T12:00:00.000Z");
  failTailorEnqueue = false;
});

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
  if (created) {
    const admin = new pg.Client({ connectionString: created.adminUrl });
    await admin.connect();
    try {
      await admin.query(`DROP DATABASE IF EXISTS "${created.name}" WITH (FORCE)`);
    } finally {
      await admin.end();
    }
  }
});

describe("createBatch", () => {
  it("creates one FETCHING posting per distinct link and one job.fetch each, grouped by domain", async () => {
    const { userId, cvBaseId } = await ownerWithCv();
    const created = await batchOf(userId, [
      `https://www.linkedin.com/jobs/view/101/?trk=${URL_MARKER}`,
      "https://linkedin.com/jobs/search/?currentJobId=101",
      "https://lnkd.in/abc",
      "https://acme.gupy.io/jobs/7?utm_source=x",
    ]);
    expect(created.cvBaseId).toBe(cvBaseId);
    expect(created.duplicatesMerged).toBe(1);
    expect(created.postings.map((p) => [p.url, p.source, p.status])).toEqual([
      ["https://www.linkedin.com/jobs/view/101/", "LINKEDIN", "FETCHING"],
      ["https://lnkd.in/abc", "LINKEDIN", "FETCHING"],
      ["https://acme.gupy.io/jobs/7", "OTHER", "FETCHING"],
    ]);
    const queued = await Promise.all(created.postings.map((p) => jobs(p.id)));
    expect(queued.flat().map((j) => [j.name, j.groupId])).toEqual([
      ["job.fetch", "linkedin.com"],
      ["job.fetch", "linkedin.com"],
      ["job.fetch", "gupy.io"],
    ]);
    const [event] = await auditOf(created.batchId);
    expect(event).toMatchObject({
      actorType: "USER",
      actorId: userId,
      action: "tailoring_batch.created",
      after: { cvBaseId, postings: 3, duplicatesMerged: 1 },
    });
  });

  it("rolls the batch, its postings and the jobs already inserted back when an enqueue fails", async () => {
    const { userId } = await ownerWithCv();
    const before = (await jobs()).length;
    await expect(
      postings.createBatch(
        userId,
        ["https://acme.gupy.io/jobs/1", "https://acme.gupy.io/jobs/2"],
        userMeta(userId),
        failingFetchEnqueue(2),
      ),
    ).rejects.toThrow("queue down after insert");
    expect(await prisma.tailoringBatch.count({ where: { userId } })).toBe(0);
    expect(await prisma.jobPosting.count({ where: { userId } })).toBe(0);
    expect(await jobs()).toHaveLength(before);
  });

  it("creates a LinkedIn link that is not a job view as FAILED/FETCH_BLOCKED, with no job (ADR-0008 §1)", async () => {
    const { userId } = await ownerWithCv();
    const created = await batchOf(userId, [
      "https://www.linkedin.com/in/fulano/?trk=x",
      "https://www.linkedin.com/jobs/view/909/",
    ]);
    expect(created.blocked).toBe(1);
    const [blocked, fetchable] = created.postings;
    expect(blocked).toMatchObject({ status: "FAILED", failureReason: "FETCH_BLOCKED" });
    expect(fetchable).toMatchObject({ status: "FETCHING" });
    expect(await jobs(blocked!.id)).toEqual([]);
    expect(created.jobIds).toHaveLength(1);
    expect((await auditOf(created.batchId))[0]?.after).toMatchObject({ blocked: 1 });

    // Reprocessing it would fetch it: refused until the text is pasted, which needs no fetch.
    const enqueue = { fetch: enqueueFetch, tailor: enqueueTailor };
    await expect(
      postings.retry(userId, blocked!.id, userMeta(userId), enqueue),
    ).rejects.toBeInstanceOf(JobPostingTextRequiredError);
    expect(await jobs(blocked!.id)).toEqual([]);
    await postings.pasteText(userId, blocked!.id, POSTING_TEXT, userMeta(userId), enqueueFetch);
    expect((await jobs(blocked!.id)).map((j) => j.groupId)).toEqual(["pasted"]);
  });

  it("refuses links that outgrow the bound once normalized, before any transaction", async () => {
    const { userId } = await ownerWithCv();
    // 2 046 characters as sent; percent-encoding `é` (→ %C3%A9) makes it far longer than 2 048.
    const grows = `https://acme.gupy.io/${"é".repeat(2046 - "https://acme.gupy.io/".length)}`;
    expect(grows.length).toBeLessThanOrEqual(2048);
    const before = (await jobs()).length;
    await expect(batchOf(userId, ["https://acme.gupy.io/jobs/ok", grows])).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof JobPostingUrlTooLongError && error.positions.join() === "2",
    );
    expect(await prisma.tailoringBatch.count({ where: { userId } })).toBe(0);
    expect(await jobs()).toHaveLength(before);
  });

  it("requires a confirmed, active CV base", async () => {
    const userId = await owner();
    await expect(batchOf(userId, ["https://acme.gupy.io/jobs/1"])).rejects.toBeInstanceOf(
      CvBaseRequiredError,
    );
    expect(await prisma.tailoringBatch.count({ where: { userId } })).toBe(0);
  });
});

describe("worker store", () => {
  it("runs FETCHING → ANALYZING → READY, enqueuing cv.tailor with the extraction", async () => {
    const { userId, cvBaseId } = await ownerWithCv();
    const {
      postings: [posting],
    } = await batchOf(userId, ["https://acme.gupy.io/jobs/1"]);
    const id = posting!.id;
    expect(await current.loadForFetch(id)).toEqual({
      source: { kind: "url", url: "https://acme.gupy.io/jobs/1" },
      fetchedText: null,
    });
    await current.saveFetchedText(id, POSTING_TEXT);
    // A retry of job.fetch reuses the saved text (ADR-0008 §4).
    expect((await current.loadForFetch(id))?.fetchedText).toBe(POSTING_TEXT);
    await runPipeline(id);

    expect((await jobs(id)).map((j) => j.name)).toEqual(["job.fetch", "cv.tailor"]);
    const detail = await postings.get(userId, id);
    expect(detail).toMatchObject({
      status: "READY",
      title: "Senior Backend Engineer",
      company: "Fictional Corp",
      baseScore: 70,
      tailoring: { cvBaseId, generatedWithPreviousCv: false, generation: GENERATION },
    });
    expect(detail.tailoring?.content).toEqual(tailoredCvContent());
    const events = await auditOf(id);
    expect(events.map((e) => [e.action, e.actorType])).toEqual([
      ["job_posting.extracted", "WORKER"],
      ["job_posting.tailoring_ready", "WORKER"],
    ]);
    expect(events[0]?.actorId).toMatch(/^job-/);
    expect(events[1]?.after).toMatchObject({
      status: "READY",
      cvBaseId,
      baseScore: 70,
      model: "gpt-test-1",
      promptVersions: "cv-competency-lexicon@1.0.1,cv-humanize@1.0.0,cv-tailor@1.0.0",
    });
  });

  it("keeps the posting FETCHING and drops the cv.tailor job when the enqueue fails", async () => {
    const { userId } = await ownerWithCv();
    const {
      postings: [posting],
    } = await batchOf(userId, ["https://acme.gupy.io/jobs/2"]);
    const id = posting!.id;
    failTailorEnqueue = true;
    await expect(
      current.completeExtraction(id, {
        job: jobPostingExtracted(),
        rawText: POSTING_TEXT,
        droppedRequirementCount: 0,
        injectionSuspected: false,
        injectionEvidence: null,
        generation: GENERATION,
      }),
    ).rejects.toThrow("queue down after insert");
    expect((await prisma.jobPosting.findUniqueOrThrow({ where: { id } })).status).toBe("FETCHING");
    expect((await jobs(id)).map((j) => j.name)).toEqual(["job.fetch"]);
    expect(await auditOf(id)).toHaveLength(0);
  });

  it("ignores duplicated and late jobs (load* null, writes no-op)", async () => {
    const { userId } = await ownerWithCv();
    const {
      postings: [posting],
    } = await batchOf(userId, ["https://acme.gupy.io/jobs/3"]);
    const id = posting!.id;
    await runPipeline(id);
    const auditCount = (await auditOf(id)).length;

    expect(await current.loadForFetch(id)).toBeNull();
    expect(await current.loadForTailoring(id)).toBeNull();
    await current.saveFetchedText(id, "outro texto");
    await current.completeExtraction(id, {
      job: jobPostingExtracted("Outra"),
      rawText: "outro texto",
      droppedRequirementCount: 0,
      injectionSuspected: false,
      injectionEvidence: null,
      generation: GENERATION,
    });
    await current.markFailed(id, "ai");
    const row = await prisma.jobPosting.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ status: "READY", pageText: POSTING_TEXT });
    expect((await jobs(id)).filter((j) => j.name === "cv.tailor")).toHaveLength(1);
    expect(await auditOf(id)).toHaveLength(auditCount);
    // A posting deleted meanwhile: everything exits quietly.
    expect(await current.loadForFetch(newId())).toBeNull();
    await expect(current.markFailed(newId(), "fetch")).resolves.toBeUndefined();
  });

  it("ignores a late job of an earlier cycle that finds the posting back in the same status (ABA)", async () => {
    const { userId } = await ownerWithCv();
    const { postings: list } = await batchOf(userId, [
      "https://acme.gupy.io/jobs/aba-1",
      "https://acme.gupy.io/jobs/aba-2",
    ]);
    const [tailoring, fetching] = list.map((p) => p.id) as [string, string];
    const late = { jobId: "job-late", correlationId: "corr-late", attempt: 1 };
    const enqueue = { fetch: enqueueFetch, tailor: enqueueTailor };

    // READY (cycle 1) → reprocessed → ANALYZING again (cycle 2); the cv.tailor of cycle 1 arrives late.
    await runPipeline(tailoring);
    await postings.retry(userId, tailoring, userMeta(userId), enqueue);
    expect((await jobs(tailoring)).map((j) => [j.name, j.attempt])).toEqual([
      ["job.fetch", 1],
      ["cv.tailor", 1],
      ["cv.tailor", 2],
    ]);
    expect(await store.loadForTailoring(tailoring, late)).toBeNull();
    await store.completeTailoring(
      tailoring,
      {
        cvBaseId: (await current.loadForTailoring(tailoring))!.cvBaseId,
        content: tailoredCvContent(),
        report: matchReport(1),
        generation: GENERATION,
      },
      late,
    );
    await store.markFailed(tailoring, "ai", late);
    expect(await prisma.jobPosting.findUniqueOrThrow({ where: { id: tailoring } })).toMatchObject({
      status: "ANALYZING",
      attempt: 2,
    });
    expect((await postings.get(userId, tailoring)).baseScore).toBeNull();

    // FETCHING (cycle 1) → failed → reprocessed → FETCHING again (cycle 2); the job.fetch of cycle 1 is late.
    await current.markFailed(fetching, "fetch");
    await postings.retry(userId, fetching, userMeta(userId), enqueue);
    expect(await store.loadForFetch(fetching, late)).toBeNull();
    await store.saveFetchedText(fetching, POSTING_TEXT, late);
    await store.completeExtraction(
      fetching,
      {
        job: jobPostingExtracted(),
        rawText: POSTING_TEXT,
        droppedRequirementCount: 0,
        injectionSuspected: false,
        injectionEvidence: null,
        generation: GENERATION,
      },
      late,
    );
    expect(await prisma.jobPosting.findUniqueOrThrow({ where: { id: fetching } })).toMatchObject({
      status: "FETCHING",
      attempt: 2,
      pageText: null,
      extracted: null,
    });
    expect((await jobs(fetching)).filter((j) => j.name === "cv.tailor")).toHaveLength(0);
    expect(await current.loadForFetch(fetching)).not.toBeNull();
  });

  it("a blocked failure stores what blocked it and when to retry, cleared on restart (issue #112)", async () => {
    const { userId } = await ownerWithCv();
    const { postings: list } = await batchOf(userId, [
      "https://acme.gupy.io/jobs/blocked-1",
      "https://acme.gupy.io/jobs/blocked-2",
      "https://acme.gupy.io/jobs/blocked-3",
    ]);
    const [quota, disabled, plain] = list.map((p) => p.id) as [string, string, string];
    const retryAt = new Date("2026-10-23T09:00:00.000Z");
    await store.markFailed(quota, "fetch_blocked", await workerMeta(quota), {
      kind: "QUOTA",
      retryAt,
    });
    await store.markFailed(disabled, "fetch_blocked", await workerMeta(disabled), {
      kind: "DISABLED",
      retryAt: null,
    });
    // A detail only goes with fetch_blocked.
    await store.markFailed(plain, "fetch", await workerMeta(plain), { kind: "BREAKER", retryAt });

    expect((await postings.get(userId, quota)).blocked).toEqual({ kind: "QUOTA", retryAt });
    expect((await postings.get(userId, disabled)).blocked).toEqual({
      kind: "DISABLED",
      retryAt: null,
    });
    expect((await postings.get(userId, plain)).blocked).toBeNull();
    expect((await auditOf(quota)).at(-1)?.after).toMatchObject({ blockedKind: "QUOTA" });

    await postings.pasteText(userId, quota, POSTING_TEXT, userMeta(userId), enqueueFetch);
    expect(await prisma.jobPosting.findUniqueOrThrow({ where: { id: quota } })).toMatchObject({
      blockedKind: null,
      blockedRetryAt: null,
    });
  });

  it("marks failures with the stored reason and the worker's cause in the audit", async () => {
    const { userId } = await ownerWithCv();
    const { postings: list } = await batchOf(userId, [
      "https://acme.gupy.io/jobs/4",
      "https://acme.gupy.io/jobs/5",
    ]);
    await current.markFailed(list[0]!.id, "fetch_blocked");
    await current.markFailed(list[1]!.id, "not_a_job");
    const rows = await prisma.jobPosting.findMany({
      where: { id: { in: list.map((p) => p.id) } },
      orderBy: { id: "asc" },
    });
    expect(rows.map((r) => [r.status, r.failureReason])).toEqual([
      ["FAILED", "FETCH_BLOCKED"],
      ["FAILED", "NOT_A_JOB"],
    ]);
    const [event] = await auditOf(list[0]!.id);
    expect(event).toMatchObject({
      actorType: "WORKER",
      action: "job_posting.failed",
      before: { status: "FETCHING" },
      after: { status: "FAILED", failureReason: "FETCH_BLOCKED", cause: "fetch_blocked" },
    });
  });

  it("tailors against the CV base active now and flags a result made with a previous one", async () => {
    const { userId, cvBaseId } = await ownerWithCv();
    const {
      postings: [posting],
    } = await batchOf(userId, ["https://acme.gupy.io/jobs/6"]);
    const newer = await activateCv(userId);
    await runPipeline(posting!.id);
    const tailored = await postings.get(userId, posting!.id);
    expect(tailored.tailoring).toMatchObject({ cvBaseId: newer, generatedWithPreviousCv: false });
    expect(newer).not.toBe(cvBaseId);
    await activateCv(userId);
    expect((await postings.get(userId, posting!.id)).tailoring?.generatedWithPreviousCv).toBe(true);
  });

  it("bounds the stored text and the injection excerpt", async () => {
    const { userId } = await ownerWithCv();
    const {
      postings: [posting],
    } = await batchOf(userId, ["https://acme.gupy.io/jobs/8"]);
    await current.completeExtraction(posting!.id, {
      job: jobPostingExtracted(),
      rawText: `${"é".repeat(20_010)}\u0000`,
      droppedRequirementCount: 2,
      injectionSuspected: true,
      injectionEvidence: "x".repeat(800),
      generation: GENERATION,
    });
    const row = await prisma.jobPosting.findUniqueOrThrow({ where: { id: posting!.id } });
    expect(Array.from(row.pageText ?? "")).toHaveLength(20_000);
    expect(row.injectionEvidence).toHaveLength(500);
    expect(row.droppedRequirementCount).toBe(2);
  });
});

describe("owner actions", () => {
  it("pastes text into a failed posting: PASTED, FETCHING, job.fetch in the pasted group", async () => {
    const { userId } = await ownerWithCv();
    const {
      postings: [posting],
    } = await batchOf(userId, ["https://www.linkedin.com/jobs/view/202/"]);
    const id = posting!.id;
    await current.markFailed(id, "fetch");
    const pasted = await postings.pasteText(
      userId,
      id,
      POSTING_TEXT,
      userMeta(userId),
      enqueueFetch,
    );
    expect(pasted.posting).toMatchObject({
      status: "FETCHING",
      source: "PASTED",
      failureReason: null,
    });
    expect((await jobs(id)).at(-1)).toMatchObject({ name: "job.fetch", groupId: "pasted" });
    expect(await current.loadForFetch(id)).toEqual({
      source: { kind: "pasted", text: POSTING_TEXT },
      fetchedText: null,
    });
    // saveFetchedText never overwrites a pasted text.
    await current.saveFetchedText(id, "texto buscado");
    expect((await prisma.jobPosting.findUniqueOrThrow({ where: { id } })).pageText).toBe(
      POSTING_TEXT,
    );
    const events = await auditOf(id);
    expect(events.at(-1)).toMatchObject({
      actorType: "USER",
      action: "job_posting.text_pasted",
      before: { status: "FAILED", failureReason: "FETCH" },
      after: { status: "FETCHING", source: "PASTED" },
    });
  });

  it("refuses to restart a posting still being processed, and hides other owners' postings", async () => {
    const { userId } = await ownerWithCv();
    const {
      postings: [posting],
    } = await batchOf(userId, ["https://acme.gupy.io/jobs/9"]);
    const id = posting!.id;
    await expect(
      postings.retry(userId, id, userMeta(userId), { fetch: enqueueFetch, tailor: enqueueTailor }),
    ).rejects.toBeInstanceOf(JobPostingBusyError);
    await expect(
      postings.pasteText(userId, id, POSTING_TEXT, userMeta(userId), enqueueFetch),
    ).rejects.toBeInstanceOf(JobPostingBusyError);
    const stranger = await owner();
    await expect(postings.get(stranger, id)).rejects.toBeInstanceOf(JobPostingNotFoundError);
    await expect(postings.delete(stranger, id, userMeta(stranger))).rejects.toBeInstanceOf(
      JobPostingNotFoundError,
    );
    await expect(
      postings.pasteText(stranger, id, POSTING_TEXT, userMeta(stranger), enqueueFetch),
    ).rejects.toBeInstanceOf(JobPostingNotFoundError);
    expect((await jobs(id)).map((j) => j.name)).toEqual(["job.fetch"]);
  });

  it("reprocessing a READY posting re-tailors only and replaces the tailored CV, auditing the previous generation", async () => {
    const { userId } = await ownerWithCv();
    const {
      postings: [posting],
    } = await batchOf(userId, ["https://acme.gupy.io/jobs/10"]);
    const id = posting!.id;
    await runPipeline(id);
    const retried = await postings.retry(userId, id, userMeta(userId), {
      fetch: enqueueFetch,
      tailor: enqueueTailor,
    });
    expect(retried.posting.status).toBe("ANALYZING");
    expect((await jobs(id)).map((j) => j.name)).toEqual(["job.fetch", "cv.tailor", "cv.tailor"]);
    // While re-tailoring, the previous tailored CV is not served.
    expect((await postings.get(userId, id)).tailoring).toBeNull();

    const input = await current.loadForTailoring(id);
    await current.completeTailoring(id, {
      cvBaseId: input!.cvBaseId,
      content: tailoredCvContent("CANARIO-TAILORED-0001"),
      report: matchReport(55),
      generation: { ...GENERATION, model: "gpt-test-2" },
    });
    expect(await prisma.tailoredCv.count({ where: { jobPostingId: id } })).toBe(1);
    expect((await postings.get(userId, id)).baseScore).toBe(55);
    const last = (await auditOf(id)).at(-1);
    expect(last?.before).toMatchObject({
      status: "ANALYZING",
      replacedModel: "gpt-test-1",
      replacedPromptVersions: "cv-competency-lexicon@1.0.1,cv-humanize@1.0.0,cv-tailor@1.0.0",
    });
    expect(last?.after).toMatchObject({ model: "gpt-test-2", baseScore: 55 });
  });

  it("reprocessing without extraction re-reads the kept text; without text it fetches the link again", async () => {
    const { userId } = await ownerWithCv();
    const { postings: list } = await batchOf(userId, [
      "https://acme.gupy.io/jobs/11",
      "https://www.linkedin.com/jobs/view/303/",
    ]);
    const [withText, withoutText] = list.map((p) => p.id) as [string, string];
    await current.saveFetchedText(withText, POSTING_TEXT);
    await current.markFailed(withText, "not_a_job");
    await current.markFailed(withoutText, "fetch");
    const enqueue = { fetch: enqueueFetch, tailor: enqueueTailor };

    await postings.retry(userId, withText, userMeta(userId), enqueue);
    expect(await current.loadForFetch(withText)).toEqual({
      source: { kind: "url", url: "https://acme.gupy.io/jobs/11" },
      fetchedText: POSTING_TEXT,
    });
    await postings.retry(userId, withoutText, userMeta(userId), enqueue);
    expect((await jobs(withoutText)).at(-1)).toMatchObject({
      name: "job.fetch",
      groupId: "linkedin.com",
    });
    expect(await current.loadForFetch(withoutText)).toMatchObject({ fetchedText: null });
  });

  it("deletes a posting with its tailored CV, and the batch with its last posting", async () => {
    const { userId } = await ownerWithCv();
    const created = await batchOf(userId, [
      "https://acme.gupy.io/jobs/12",
      "https://acme.gupy.io/jobs/13",
    ]);
    const [first, second] = created.postings.map((p) => p.id) as [string, string];
    await runPipeline(first);
    await postings.delete(userId, first, userMeta(userId));
    expect(await prisma.tailoredCv.count({ where: { jobPostingId: first } })).toBe(0);
    expect(await prisma.tailoringBatch.count({ where: { id: created.batchId } })).toBe(1);
    await postings.delete(userId, second, userMeta(userId));
    expect(await prisma.tailoringBatch.count({ where: { id: created.batchId } })).toBe(0);
    expect((await auditOf(second)).at(-1)).toMatchObject({
      action: "job_posting.deleted",
      after: { batchDeleted: "true" },
    });
    // A late job for the deleted posting exits quietly.
    expect(await current.loadForFetch(second)).toBeNull();
  });

  it("concurrent deletions of a batch's last postings still remove the batch", async () => {
    const { userId } = await ownerWithCv();
    for (let round = 0; round < 5; round += 1) {
      const created = await batchOf(userId, [
        `https://acme.gupy.io/jobs/race-${round}-a`,
        `https://acme.gupy.io/jobs/race-${round}-b`,
      ]);
      const [a, b] = created.postings.map((p) => p.id) as [string, string];
      await Promise.all([
        postings.delete(userId, a, userMeta(userId)),
        postings.delete(userId, b, userMeta(userId)),
      ]);
      expect(await prisma.tailoringBatch.count({ where: { id: created.batchId } })).toBe(0);
    }
  });

  it("lists the owner's postings newest first with a cursor", async () => {
    const { userId } = await ownerWithCv();
    const first = await batchOf(userId, [
      "https://acme.gupy.io/jobs/20",
      "https://acme.gupy.io/jobs/21",
    ]);
    const second = await batchOf(userId, ["https://acme.gupy.io/jobs/22"]);
    await runPipeline(second.postings[0]!.id);
    const page1 = await postings.list(userId, { limit: 2 });
    expect(page1.items.map((p) => p.id)).toEqual([second.postings[0]!.id, first.postings[1]!.id]);
    expect(page1.items[0]).toMatchObject({ status: "READY", baseScore: 70 });
    expect(page1.nextCursor).toBe(first.postings[1]!.id);
    const page2 = await postings.list(userId, { limit: 2, cursor: page1.nextCursor! });
    expect(page2).toEqual({
      items: [expect.objectContaining({ id: first.postings[0]!.id, baseScore: null })],
      nextCursor: null,
    });
    expect((await postings.list(await owner(), { limit: 20 })).items).toEqual([]);
  });
});

describe("sweep", () => {
  it("times out postings stuck past their window, on sweep and on read", async () => {
    const { userId } = await ownerWithCv();
    const { postings: list } = await batchOf(userId, [
      "https://acme.gupy.io/jobs/30",
      "https://acme.gupy.io/jobs/31",
      "https://acme.gupy.io/jobs/32",
    ]);
    const [fetching, analyzing, fresh] = list.map((p) => p.id) as [string, string, string];
    await current.completeExtraction(analyzing, {
      job: jobPostingExtracted(),
      rawText: POSTING_TEXT,
      droppedRequirementCount: 0,
      injectionSuspected: false,
      injectionEvidence: null,
      generation: GENERATION,
    });
    const start = clock.getTime();
    clock = new Date(start + JOB_POSTING_STALE_MS.ANALYZING + 1);
    // ANALYZING is past its window, FETCHING (which covers the 24 h quota wait) is not.
    expect((await postings.get(userId, analyzing)).status).toBe("FAILED");
    expect((await postings.get(userId, fetching)).status).toBe("FETCHING");

    await prisma.jobPosting.update({
      where: { id: fresh },
      data: { updatedAt: new Date(start + JOB_POSTING_STALE_MS.FETCHING) },
    });
    clock = new Date(start + JOB_POSTING_STALE_MS.FETCHING + 1);
    const swept = await postings.sweep();
    expect(swept.timedOut).toBeGreaterThanOrEqual(1);
    const rows = await prisma.jobPosting.findMany({
      where: { id: { in: [fetching, analyzing, fresh] } },
      orderBy: { id: "asc" },
    });
    expect(rows.map((r) => [r.status, r.failureReason])).toEqual([
      ["FAILED", "TIMED_OUT"],
      ["FAILED", "TIMED_OUT"],
      ["FETCHING", null],
    ]);
    expect((await auditOf(fetching)).at(-1)).toMatchObject({
      actorType: "SYSTEM",
      action: "job_posting.failed",
      after: { status: "FAILED", failureReason: "TIMED_OUT" },
    });
  });

  it("settles a backlog larger than one sweep in bounded passes, each posting in its own transaction", async () => {
    const { userId } = await ownerWithCv();
    const ids: string[] = [];
    for (let b = 0; b < 3; b += 1) {
      const urls = Array.from(
        { length: 20 },
        (_, i) => `https://acme.gupy.io/jobs/backlog-${b}-${i}`,
      );
      ids.push(...(await batchOf(userId, urls)).postings.map((p) => p.id));
    }
    // Older than any other test's postings, so this backlog is swept first.
    await prisma.jobPosting.updateMany({
      where: { id: { in: ids } },
      data: { updatedAt: new Date("2000-01-01T00:00:00.000Z") },
    });
    const first = await postings.sweep();
    expect(first.timedOut).toBe(JOB_POSTING_SWEEP_BATCH);
    await postings.sweep();
    expect(
      await prisma.jobPosting.count({ where: { id: { in: ids }, failureReason: "TIMED_OUT" } }),
    ).toBe(60);
  });

  it("erases the text of postings failed for longer than the retention (the CV's)", async () => {
    expect(JOB_POSTING_FAILED_TEXT_RETENTION_MS).toBe(CV_EXTRACTION_STALE_MS);
    const { userId } = await ownerWithCv();
    const { postings: list } = await batchOf(userId, [
      "https://acme.gupy.io/jobs/40",
      "https://acme.gupy.io/jobs/41",
    ]);
    const [old, recent] = list.map((p) => p.id) as [string, string];
    for (const id of [old, recent]) {
      await current.saveFetchedText(id, POSTING_TEXT);
      await current.markFailed(id, "not_a_job");
    }
    await prisma.jobPosting.update({
      where: { id: recent },
      data: { updatedAt: new Date(clock.getTime() + 60_000) },
    });
    clock = new Date(clock.getTime() + JOB_POSTING_FAILED_TEXT_RETENTION_MS + 1);
    expect((await postings.sweep()).textErased).toBeGreaterThanOrEqual(1);
    const rows = await prisma.jobPosting.findMany({
      where: { id: { in: [old, recent] } },
      orderBy: { id: "asc" },
    });
    expect(rows.map((r) => r.pageText)).toEqual([null, POSTING_TEXT]);
  });
});

describe("personal data", () => {
  it("never puts URLs, posting text or CV content in the audit trail", async () => {
    const events = await prisma.auditEvent.findMany({
      where: { entityType: { in: ["job_posting", "tailoring_batch"] } },
    });
    expect(events.length).toBeGreaterThan(10);
    const serialized = JSON.stringify(events);
    for (const marker of [
      URL_MARKER,
      TEXT_MARKER,
      "CANARIO-TAILORED",
      "CANARIO-CV",
      "gupy.io",
      "https://",
    ]) {
      expect(serialized).not.toContain(marker);
    }
  });
});
