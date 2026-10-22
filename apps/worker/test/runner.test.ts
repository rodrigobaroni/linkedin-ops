import { Writable } from "node:stream";
import { pino } from "pino";
import { describe, expect, it } from "vitest";
import type { Job } from "pg-boss";
import {
  CancelledJobError,
  PermanentJobError,
  RescheduleJobError,
  RetryableJobError,
} from "../src/jobs/errors.js";
import { createJobRunner } from "../src/jobs/runner.js";
import { REDACTED_PATHS } from "../src/logger.js";

const PAYLOAD = {
  schemaVersion: 1,
  correlationId: "req_01JABCDEF",
  requestedBy: { type: "USER", id: "018f6b1e-7c2a-7b3c-9d4e-000000000001" },
  cvBaseId: "018f6b1e-7c2a-7b3c-9d4e-000000000015",
};

function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  return { lines, logger: pino({ level: "debug", redact: REDACTED_PATHS }, stream) };
}

const job = (data: unknown, retryCount = 0): Job<unknown> => ({
  id: "job-1",
  name: "cv.extract",
  data,
  expireInSeconds: 600,
  heartbeatSeconds: null,
  retryCount,
  signal: new AbortController().signal,
});

describe("createJobRunner (ADR-0002 §7)", () => {
  it("completes a valid job and passes attempt info", async () => {
    const { logger } = capture();
    let seen: { isLastAttempt: boolean } | null = null;
    const run = createJobRunner("cv.extract", async (_p, ctx) => void (seen = ctx), logger);
    await expect(run([job(PAYLOAD, 2)])).resolves.toEqual([{ id: "job-1", status: "completed" }]);
    expect(seen).toMatchObject({ isLastAttempt: true, retryCount: 2 });
  });

  it("dead-letters an invalid payload without running the handler", async () => {
    const { logger, lines } = capture();
    let ran = false;
    const run = createJobRunner("cv.extract", async () => void (ran = true), logger);
    const result = await run([job({ ...PAYLOAD, text: "CANARY Ana Exemplo" })]);
    expect(result).toEqual([{ id: "job-1", status: "deadletter" }]);
    expect(ran).toBe(false);
    expect(lines.join()).not.toContain("CANARY");
  });

  it("dead-letters permanent errors and fails (retries) the rest", async () => {
    const { logger, lines } = capture();
    const permanent = createJobRunner(
      "cv.extract",
      () => Promise.reject(new PermanentJobError("llm:AUTH")),
      logger,
    );
    const transient = createJobRunner(
      "cv.extract",
      () => Promise.reject(new RetryableJobError("ai:SCHEMA_INVALID")),
      logger,
    );
    await expect(permanent([job(PAYLOAD)])).resolves.toEqual([
      { id: "job-1", status: "deadletter" },
    ]);
    await expect(transient([job(PAYLOAD)])).resolves.toEqual([{ id: "job-1", status: "failed" }]);
    const logged = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(logged.map((l) => l.errorClass)).toEqual([
      "PERMANENT:llm:AUTH",
      "TRANSIENT:ai:SCHEMA_INVALID",
    ]);
    expect(logged[0]).toMatchObject({ queue: "cv.extract", jobId: "job-1", attempt: 1 });
  });

  it("redacts content-bearing keys even if a handler logs them", async () => {
    const { logger, lines } = capture();
    const run = createJobRunner(
      "cv.extract",
      async (_p, ctx) => ctx.logger.info({ text: "CANARY CV", cv: { name: "CANARY" } }, "oops"),
      logger,
    );
    await run([job(PAYLOAD)]);
    expect(lines.join()).not.toContain("CANARY");
  });

  it("on worker shutdown, re-enqueues the job instead of consuming a retry, even on the last attempt", async () => {
    const { logger } = capture();
    const requeued: unknown[] = [];
    const shutdown = new AbortController();
    const run = createJobRunner(
      "cv.extract",
      (_p, ctx) => {
        shutdown.abort();
        expect(ctx.signal.aborted).toBe(true);
        return Promise.reject(new CancelledJobError());
      },
      logger,
      (payload, options) => (requeued.push(payload, options), Promise.resolve()),
      shutdown.signal,
    );
    await expect(
      run([{ ...job(PAYLOAD, 2), groupId: "linkedin.com", groupTier: "standard" }]),
    ).resolves.toEqual([{ id: "job-1", status: "completed", output: { cancelled: true } }]);
    // The re-enqueued job keeps its group, so groupConcurrency still serializes it per domain.
    expect(requeued).toEqual([
      PAYLOAD,
      { startAfter: 30, group: { id: "linkedin.com", tier: "standard" } },
    ]);
  });

  it("a cancellation raised by pg-boss (job expired) follows pg-boss's retry, without re-enqueue", async () => {
    const { logger } = capture();
    const requeued: unknown[] = [];
    const expired = new AbortController();
    expired.abort();
    const run = createJobRunner(
      "cv.extract",
      () => Promise.reject(new CancelledJobError()),
      logger,
      (payload) => (requeued.push(payload), Promise.resolve()),
      new AbortController().signal,
    );
    const expiredJob = { ...job(PAYLOAD), signal: expired.signal };
    await expect(run([expiredJob])).resolves.toEqual([{ id: "job-1", status: "failed" }]);
    expect(requeued).toEqual([]);
  });

  it("falls back to a retry when the re-enqueue fails, and without a requeue", async () => {
    const { logger } = capture();
    const stopped = new AbortController();
    stopped.abort();
    const failing = createJobRunner(
      "cv.extract",
      () => Promise.reject(new CancelledJobError()),
      logger,
      () => Promise.reject(new Error("db down")),
      stopped.signal,
    );
    await expect(failing([job(PAYLOAD)])).resolves.toEqual([{ id: "job-1", status: "failed" }]);
    const none = createJobRunner(
      "cv.extract",
      () => Promise.reject(new CancelledJobError()),
      logger,
    );
    await expect(none([job(PAYLOAD)])).resolves.toEqual([{ id: "job-1", status: "failed" }]);
  });

  it("reschedules with startAfter in the same group, completing the job without consuming a retry", async () => {
    const { logger, lines } = capture();
    const requeued: unknown[] = [];
    const at = new Date("2026-10-22T12:00:15.000Z");
    const run = createJobRunner(
      "cv.extract",
      () => Promise.reject(new RescheduleJobError(at, "fetch:wait")),
      logger,
      (payload, options) => (requeued.push(payload, options), Promise.resolve()),
    );
    await expect(run([{ ...job(PAYLOAD, 1), groupId: "gupy.io" }])).resolves.toEqual([
      { id: "job-1", status: "completed", output: { rescheduled: true } },
    ]);
    expect(requeued).toEqual([PAYLOAD, { startAfter: at, group: { id: "gupy.io" } }]);
    expect(lines.join()).toContain('"outcome":"rescheduled"');
  });

  it("a reschedule falls back to a retry when the re-enqueue fails", async () => {
    const { logger } = capture();
    const run = createJobRunner(
      "cv.extract",
      () => Promise.reject(new RescheduleJobError(new Date(), "fetch:wait")),
      logger,
      () => Promise.reject(new Error("db down")),
    );
    await expect(run([job(PAYLOAD)])).resolves.toEqual([{ id: "job-1", status: "failed" }]);
  });
});
