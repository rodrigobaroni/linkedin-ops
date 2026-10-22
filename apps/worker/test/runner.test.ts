import { Writable } from "node:stream";
import { pino } from "pino";
import { describe, expect, it } from "vitest";
import type { Job } from "pg-boss";
import { PermanentJobError, RetryableJobError } from "../src/jobs/errors.js";
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
});
