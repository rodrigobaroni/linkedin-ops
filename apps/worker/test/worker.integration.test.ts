/**
 * pg-boss against a real PostgreSQL (Testcontainers, CI `db-integration` job; or an empty database through
 * `WORKER_IT_DATABASE_URL`). Proves: queues and dead-letter queues provisioned from the catalogue; a Career
 * job end to end with the simulated LLM; invalid payloads and permanent failures dead-lettered without
 * retries; transient failures retried until success and, when they never stop, exhausted into the DLQ with
 * the draft marked failed; and SIGTERM through the real lifecycle cancelling a job in flight (Crivo PR89-4).
 */
import { EventEmitter } from "node:events";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  LlmError,
  SimulatedLlmClient,
  type LlmCallOptions,
  type LlmClient,
  type LlmRequest,
} from "@linkedin-ops/editorial-engine";
import { PgBoss } from "pg-boss";
import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCareerHandlers } from "../src/career/handlers.js";
import type { CvBaseDraftStore, JobPostingStore } from "@linkedin-ops/domain";
import { unavailableJobPageFetcher } from "../src/career/ports.js";
import { PGBOSS_SCHEMA_NAME } from "../src/jobs/queues.js";
import { startWorkerLifecycle, type WorkerLifecycle } from "../src/lifecycle.js";
import {
  IDS,
  baseCv,
  cvExtractionOutput,
  cvText,
  envelope,
  humanizeOutput,
  job,
  postingText,
  tailoringOutput,
} from "./fixtures.js";

// Same image and digest as the domain suite and the Compose file (TM-21).
const POSTGRES_IMAGE =
  "postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24";

/** Optional: an empty throwaway database instead of a container (machines without Docker). */
const EXTERNAL_DATABASE_URL = process.env.WORKER_IT_DATABASE_URL;

const uuid = (n: number) => `018f6b1e-7c2a-7b3c-9d4e-${n.toString(16).padStart(12, "0")}`;

let container: StartedPostgreSqlContainer | undefined;
let databaseUrl = "";
let boss: PgBoss | undefined;
let lifecycle: WorkerLifecycle | undefined;
const events: string[] = [];

// Test-controlled LLM behaviour.
let failTailoring = false;
let extractTransientFailuresLeft = 0;
let hangTailoring = false;
let hangStarted = false;
let hangAborted = false;

const jobStore: JobPostingStore = {
  loadForFetch: () => Promise.resolve(null),
  saveFetchedText: () => Promise.resolve(),
  completeExtraction: () => Promise.resolve(),
  loadForTailoring: () =>
    Promise.resolve({
      cvBaseId: IDS.cvBase,
      base: baseCv,
      job,
      rawText: postingText,
      jobInjectionSuspected: false,
    }),
  completeTailoring: (id, result) => (
    events.push(`tailored:${id}:${result.report.baseScore}`),
    Promise.resolve()
  ),
  markFailed: (id, reason) => (events.push(`failed:${id}:${reason}`), Promise.resolve()),
};

const cvStore: CvBaseDraftStore = {
  loadForExtraction: () => Promise.resolve({ text: cvText }),
  completeExtraction: (id) => (events.push(`cv-extracted:${id}`), Promise.resolve()),
  markFailed: (id, reason) => (events.push(`cv-failed:${id}:${reason}`), Promise.resolve()),
};

const simulated = new SimulatedLlmClient({
  "cv-extract": () => {
    if (extractTransientFailuresLeft > 0) {
      extractTransientFailuresLeft -= 1;
      throw new LlmError("UNAVAILABLE", { status: 503 });
    }
    return cvExtractionOutput;
  },
  "cv-tailor": () => {
    if (failTailoring) throw new LlmError("AUTH", { status: 401 });
    return tailoringOutput();
  },
  "cv-humanize": humanizeOutput(
    {},
    {
      "seg-1": "Backend engineer with 8 years in payments.",
      "seg-2": "Led the migration of the billing service to durable queues.",
      "seg-3": "Evaluated Kafka for event streaming.",
      "seg-4": "TypeScript",
    },
  ),
});

/** Like the OpenAI adapter: a call in flight ends as ABORTED when the job signal aborts. */
const llm: LlmClient = {
  complete(request: LlmRequest, options: LlmCallOptions = {}) {
    if (request.promptId !== "cv-tailor" || !hangTailoring) return simulated.complete(request);
    hangStarted = true;
    return new Promise((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => {
        hangAborted = true;
        reject(new LlmError("ABORTED"));
      });
    });
  },
};

beforeAll(async () => {
  let connectionString = EXTERNAL_DATABASE_URL;
  if (connectionString === undefined) {
    container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
    connectionString = container.getConnectionUri();
  }
  databaseUrl = connectionString;
  boss = new PgBoss({ connectionString, schema: PGBOSS_SCHEMA_NAME });
  const career = createCareerHandlers({
    llm,
    model: "gpt-test",
    rng: { hex: (n) => "c".repeat(n) },
    cvStore,
    jobStore,
    fetcher: unavailableJobPageFetcher,
    linkedInFetchEnabled: true,
  });
  lifecycle = await startWorkerLifecycle({
    boss,
    logger: pino({ level: "silent" }),
    career,
    signals: new EventEmitter() as never,
    heartbeat: () => ({ stop: () => undefined }),
    stopTimeoutMs: 2_000,
  });
});

afterAll(async () => {
  await lifecycle?.stop("afterAll");
  await container?.stop();
});

const poll = { timeout: 45_000, interval: 250 };

describe("worker on pg-boss (ADR-0002)", () => {
  it("provisions every career queue with its dead-letter queue and retry policy", async () => {
    const tailor = await boss?.getQueue("cv.tailor");
    expect(tailor).toMatchObject({
      retryLimit: 2,
      retryBackoff: true,
      deadLetter: "cv.tailor.dlq",
    });
    const fetch = await boss?.getQueue("job.fetch");
    expect(fetch).toMatchObject({
      retryLimit: 1,
      retryDelay: 60,
      retryBackoff: false,
      deadLetter: "job.fetch.dlq",
    });
    expect(await boss?.getQueue("cv.extract")).toMatchObject({ retryLimit: 2, retryBackoff: true });
    expect(await boss?.getQueue("cv.extract.dlq")).not.toBeNull();
  });

  it("runs a cv.tailor job end to end with the simulated LLM", async () => {
    await boss?.send(
      "cv.tailor",
      { ...envelope, jobPostingId: IDS.posting },
      { singletonKey: IDS.posting },
    );
    await expect.poll(() => events, poll).toContain(`tailored:${IDS.posting}:70`);
  });

  it("dead-letters an invalid payload without retries", async () => {
    const id = await boss?.send("cv.tailor", {
      ...envelope,
      jobPostingId: IDS.posting,
      text: "CANARY",
    });
    await expect
      .poll(async () => (await boss?.fetch<{ text?: string }>("cv.tailor.dlq")) ?? [], poll)
      .toEqual([expect.objectContaining({ data: expect.objectContaining({ text: "CANARY" }) })]);
    const original = id ? await boss?.getJobById("cv.tailor", id) : null;
    expect(original).toMatchObject({ state: "failed", retryCount: 0 });
  });

  it("dead-letters a permanent LLM failure at once and marks the posting failed", async () => {
    failTailoring = true;
    const posting = uuid(0xaa);
    await boss?.send("cv.tailor", { ...envelope, jobPostingId: posting });
    await expect.poll(() => events, poll).toContain(`failed:${posting}:ai`);
    await expect
      .poll(async () => (await boss?.fetch<{ jobPostingId: string }>("cv.tailor.dlq")) ?? [], poll)
      .toEqual([
        expect.objectContaining({ data: expect.objectContaining({ jobPostingId: posting }) }),
      ]);
    failTailoring = false;
  });

  describe("transient failures (retry delay shortened to 1 s for the test only)", () => {
    beforeAll(async () => {
      await boss?.updateQueue("cv.extract", { retryDelay: 1, retryBackoff: false });
    });

    it("retries a transient failure until it succeeds", async () => {
      extractTransientFailuresLeft = 2;
      const cvBaseId = uuid(0xb1);
      const id = await boss?.send("cv.extract", { ...envelope, cvBaseId });
      await expect.poll(() => events, poll).toContain(`cv-extracted:${cvBaseId}`);
      expect(events).not.toContain(`cv-failed:${cvBaseId}:ai`);
      await expect
        .poll(async () => (id ? await boss?.getJobById("cv.extract", id) : null), poll)
        .toMatchObject({ state: "completed", retryCount: 2 });
    });

    it("exhausts the retries into the DLQ and marks the draft failed once, on the last attempt", async () => {
      extractTransientFailuresLeft = Number.POSITIVE_INFINITY;
      const cvBaseId = uuid(0xb2);
      const id = await boss?.send("cv.extract", { ...envelope, cvBaseId });
      await expect.poll(() => events, poll).toContain(`cv-failed:${cvBaseId}:ai`);
      await expect
        .poll(async () => (id ? await boss?.getJobById("cv.extract", id) : null), poll)
        .toMatchObject({ state: "failed", retryCount: 2 });
      await expect
        .poll(async () => (await boss?.fetch<{ cvBaseId: string }>("cv.extract.dlq")) ?? [], poll)
        .toEqual([expect.objectContaining({ data: expect.objectContaining({ cvBaseId }) })]);
      expect(events.filter((e) => e === `cv-failed:${cvBaseId}:ai`)).toHaveLength(1);
      extractTransientFailuresLeft = 0;
    });
  });

  // Last: it stops the worker.
  it("SIGTERM stops gracefully and cancels the job in flight without failing the posting", async () => {
    hangTailoring = true;
    const posting = uuid(0xcc);
    await boss?.send("cv.tailor", { ...envelope, jobPostingId: posting });
    await expect.poll(() => hangStarted, poll).toBe(true);
    await lifecycle?.stop("SIGTERM");
    expect(hangAborted).toBe(true);
    expect(events).not.toContain(`failed:${posting}:ai`);
    expect(events.filter((e) => e.includes(posting))).toEqual([]);
    // The cancelled job was re-enqueued as a fresh job (no retry consumed, nothing dead-lettered).
    const inspector = new PgBoss({ connectionString: databaseUrl, schema: PGBOSS_SCHEMA_NAME });
    await inspector.start();
    try {
      const jobs = await inspector.findJobs<{ jobPostingId: string }>("cv.tailor", {
        data: { jobPostingId: posting },
      });
      expect(jobs.map((j) => j.state).sort()).toEqual(["completed", "created"]);
      expect(jobs.find((j) => j.state === "created")?.retryCount).toBe(0);
      const dead = await inspector.findJobs("cv.tailor.dlq", { data: { jobPostingId: posting } });
      expect(dead).toEqual([]);
    } finally {
      await inspector.stop({ graceful: false });
    }
  });
});
