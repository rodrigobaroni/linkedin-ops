/**
 * Wraps a typed handler into a pg-boss `perJobResults` handler (ADR-0002 §4, §7, §9):
 * - the payload is validated with the catalogue's Zod schema before anything runs (invalid → dead letter);
 * - `PermanentJobError` → dead letter at once; other errors → retried up to `retryLimit`, then dead letter;
 * - each outcome is logged with queue, job id, attempt, duration and error class, never the payload.
 */
import { QUEUES, type QueueName, type QueuePayload } from "@linkedin-ops/contracts";
import type { Job, JobResult } from "pg-boss";
import type { Logger } from "pino";
import { PermanentJobError, RetryableJobError } from "./errors.js";

export interface JobContext {
  jobId: string;
  /** 0 on the first run. */
  retryCount: number;
  /** True when a retryable failure now would exhaust the queue's retries. */
  isLastAttempt: boolean;
  signal: AbortSignal;
  logger: Logger;
}

export type JobHandler<N extends QueueName> = (
  payload: QueuePayload<N>,
  context: JobContext,
) => Promise<void>;

export function createJobRunner<N extends QueueName>(
  queue: N,
  handler: JobHandler<N>,
  logger: Logger,
  now: () => number = Date.now,
): (jobs: Job<unknown>[]) => Promise<JobResult[]> {
  const definition = QUEUES[queue];
  return async (jobs) => {
    const results: JobResult[] = [];
    for (const job of jobs) {
      const started = now();
      const base = { queue, jobId: job.id, attempt: job.retryCount + 1 };
      const parsed = definition.payload.safeParse(job.data);
      if (!parsed.success) {
        logger.error(
          { ...base, outcome: "deadletter", errorClass: "INVALID_PAYLOAD" },
          "job rejected",
        );
        results.push({ id: job.id, status: "deadletter" });
        continue;
      }
      const payload = parsed.data as QueuePayload<N>;
      const jobLogger = logger.child({ ...base, correlationId: payload.correlationId });
      try {
        await handler(payload, {
          jobId: job.id,
          retryCount: job.retryCount,
          isLastAttempt: job.retryCount >= definition.retryLimit,
          signal: job.signal,
          logger: jobLogger,
        });
        jobLogger.info({ outcome: "completed", durationMs: now() - started }, "job completed");
        results.push({ id: job.id, status: "completed" });
      } catch (error) {
        const permanent = error instanceof PermanentJobError;
        const errorClass = permanent
          ? `PERMANENT:${error.reason}`
          : error instanceof RetryableJobError
            ? `TRANSIENT:${error.reason}`
            : `TRANSIENT:${error instanceof Error ? error.name : "unknown"}`;
        jobLogger.warn(
          { outcome: permanent ? "deadletter" : "failed", durationMs: now() - started, errorClass },
          "job failed",
        );
        results.push({ id: job.id, status: permanent ? "deadletter" : "failed" });
      }
    }
    return results;
  };
}
