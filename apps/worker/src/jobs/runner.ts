/**
 * Wraps a typed handler into a pg-boss `perJobResults` handler (ADR-0002 §4, §7, §9):
 * - the payload is validated with the catalogue's Zod schema before anything runs (invalid → dead letter);
 * - `PermanentJobError` → dead letter at once; other errors → retried up to `retryLimit`, then dead letter;
 * - `RescheduleJobError` → the payload is re-enqueued as a fresh job with its `startAfter` and this one completes
 *   (no retry consumed; falls back to a retry if the re-enqueue fails);
 * - `CancelledJobError` caused by the worker's own shutdown (`shutdown` signal, raised before pg-boss stops) → the
 *   payload is re-enqueued as a fresh job and this one completes, so a shutdown never consumes a retry nor
 *   reaches the dead letter (falls back to a retry if the re-enqueue fails). A cancellation that pg-boss itself
 *   raised (job expired) follows pg-boss's retry; in both cases the item is never marked failed;
 * - a re-enqueued job keeps the `group` (id and tier) of the original, so `groupConcurrency` still applies;
 * - each outcome is logged with queue, job id, attempt, duration and error class, never the payload.
 */
import { QUEUES, type QueueName, type QueuePayload } from "@linkedin-ops/contracts";
import type { GroupOptions, Job, JobResult } from "pg-boss";
import type { Logger } from "pino";
import {
  CancelledJobError,
  PermanentJobError,
  RescheduleJobError,
  RetryableJobError,
} from "./errors.js";

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

/** Delay before a cancelled job runs again (lets a restarting worker come back first). */
export const CANCELLED_REQUEUE_DELAY_SECONDS = 30;

export interface RequeueOptions {
  /** Seconds from now, or an instant. */
  startAfter: number | Date;
  group?: GroupOptions;
}

/** Sends the payload as a new job of the same queue; rejects when nothing was enqueued. */
export type Requeue<N extends QueueName> = (
  payload: QueuePayload<N>,
  options: RequeueOptions,
) => Promise<unknown>;

function groupOf(job: Job<unknown>): GroupOptions | undefined {
  if (typeof job.groupId !== "string") return undefined;
  return typeof job.groupTier === "string"
    ? { id: job.groupId, tier: job.groupTier }
    : { id: job.groupId };
}

export function createJobRunner<N extends QueueName>(
  queue: N,
  handler: JobHandler<N>,
  logger: Logger,
  requeue: Requeue<N> | null = null,
  shutdown: AbortSignal | null = null,
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
          signal: shutdown === null ? job.signal : AbortSignal.any([job.signal, shutdown]),
          logger: jobLogger,
        });
        jobLogger.info({ outcome: "completed", durationMs: now() - started }, "job completed");
        results.push({ id: job.id, status: "completed" });
      } catch (error) {
        if (error instanceof RescheduleJobError && requeue !== null) {
          try {
            await requeue(payload, { startAfter: error.startAfter, group: groupOf(job) });
            jobLogger.info(
              {
                outcome: "rescheduled",
                durationMs: now() - started,
                errorClass: `RESCHEDULED:${error.reason}`,
                startAfter: error.startAfter.toISOString(),
              },
              "job rescheduled",
            );
            results.push({ id: job.id, status: "completed", output: { rescheduled: true } });
            continue;
          } catch {
            jobLogger.warn({ errorClass: "RESCHEDULED:REQUEUE_FAILED" }, "re-enqueue failed");
          }
        }
        const byShutdown = shutdown?.aborted === true && !job.signal.aborted;
        if (error instanceof CancelledJobError && byShutdown && requeue !== null) {
          try {
            await requeue(payload, {
              startAfter: CANCELLED_REQUEUE_DELAY_SECONDS,
              group: groupOf(job),
            });
            jobLogger.info(
              { outcome: "requeued", durationMs: now() - started, errorClass: "CANCELLED" },
              "job cancelled and re-enqueued",
            );
            results.push({ id: job.id, status: "completed", output: { cancelled: true } });
            continue;
          } catch {
            jobLogger.warn({ errorClass: "CANCELLED:REQUEUE_FAILED" }, "re-enqueue failed");
          }
        }
        const permanent = error instanceof PermanentJobError;
        const errorClass = permanent
          ? `PERMANENT:${error.reason}`
          : error instanceof RetryableJobError
            ? `TRANSIENT:${error.reason}`
            : error instanceof CancelledJobError
              ? "CANCELLED"
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
