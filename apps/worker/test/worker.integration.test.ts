/**
 * pg-boss against a real PostgreSQL (Testcontainers, CI `db-integration` job): queues and dead-letter queues
 * are provisioned from the catalogue, a Career job runs end to end with the simulated LLM, and invalid
 * payloads and permanent failures land in the dead-letter queue without retries.
 */
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { LlmError, SimulatedLlmClient } from "@linkedin-ops/editorial-engine";
import { PgBoss } from "pg-boss";
import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCareerHandlers } from "../src/career/handlers.js";
import { unavailableJobPageFetcher, type JobPostingStore } from "../src/career/ports.js";
import { PGBOSS_SCHEMA_NAME } from "../src/jobs/queues.js";
import { registerWorkers } from "../src/worker.js";
import {
  IDS,
  baseCv,
  envelope,
  humanizeOutput,
  job,
  postingText,
  tailoringOutput,
} from "./fixtures.js";

// Same image and digest as the domain suite and the Compose file (TM-21).
const POSTGRES_IMAGE =
  "postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24";

let container: StartedPostgreSqlContainer | undefined;
let boss: PgBoss | undefined;
const events: string[] = [];
let failTailoring = false;

const jobStore: JobPostingStore = {
  loadForFetch: () => Promise.resolve(null),
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

/** Optional: an empty throwaway database instead of a container (machines without Docker). */
const EXTERNAL_DATABASE_URL = process.env.WORKER_IT_DATABASE_URL;

beforeAll(async () => {
  let connectionString = EXTERNAL_DATABASE_URL;
  if (connectionString === undefined) {
    container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
    connectionString = container.getConnectionUri();
  }
  boss = new PgBoss({ connectionString, schema: PGBOSS_SCHEMA_NAME });
  await boss.start();
  const llm = new SimulatedLlmClient({
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
  const career = createCareerHandlers({
    llm,
    model: "gpt-test",
    rng: { hex: (n) => "c".repeat(n) },
    cvStore: {
      loadForExtraction: () => Promise.resolve(null),
      completeExtraction: () => Promise.resolve(),
      markFailed: () => Promise.resolve(),
    },
    jobStore,
    fetcher: unavailableJobPageFetcher,
    linkedInFetchEnabled: true,
  });
  await registerWorkers({ boss, logger: pino({ level: "silent" }), career });
});

afterAll(async () => {
  await boss?.stop({ graceful: true, timeout: 5_000 });
  await container?.stop();
});

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
    expect(await boss?.getQueue("cv.extract.dlq")).not.toBeNull();
  });

  it("runs a cv.tailor job end to end with the simulated LLM", async () => {
    await boss?.send(
      "cv.tailor",
      { ...envelope, jobPostingId: IDS.posting },
      { singletonKey: IDS.posting },
    );
    await expect
      .poll(() => events, { timeout: 30_000, interval: 250 })
      .toContain(`tailored:${IDS.posting}:70`);
  });

  it("dead-letters an invalid payload without retries", async () => {
    const id = await boss?.send("cv.tailor", {
      ...envelope,
      jobPostingId: IDS.posting,
      text: "CANARY",
    });
    await expect
      .poll(async () => (await boss?.fetch<{ text?: string }>("cv.tailor.dlq")) ?? [], {
        timeout: 30_000,
        interval: 500,
      })
      .toEqual([expect.objectContaining({ data: expect.objectContaining({ text: "CANARY" }) })]);
    const original = id ? await boss?.getJobById("cv.tailor", id) : null;
    expect(original).toMatchObject({ state: "failed", retryCount: 0 });
  });

  it("dead-letters a permanent LLM failure at once and marks the posting failed", async () => {
    failTailoring = true;
    const posting = "018f6b1e-7c2a-7b3c-9d4e-0000000000aa";
    await boss?.send("cv.tailor", { ...envelope, jobPostingId: posting });
    await expect
      .poll(() => events, { timeout: 30_000, interval: 250 })
      .toContain(`failed:${posting}:ai`);
    await expect
      .poll(async () => (await boss?.fetch<{ jobPostingId: string }>("cv.tailor.dlq")) ?? [], {
        timeout: 30_000,
        interval: 500,
      })
      .toEqual([
        expect.objectContaining({ data: expect.objectContaining({ jobPostingId: posting }) }),
      ]);
  });
});
