/**
 * Composition of the worker process (ADR-0002 §4, amendment of 2026-10-22: a plain composition root with
 * pg-boss and Pino; a NestJS application context comes when the worker needs domain services).
 */
import type { PgBoss } from "pg-boss";
import type { Logger } from "pino";
import type { CareerHandlers } from "./career/handlers.js";
import { CANCELLED_REQUEUE_DELAY_SECONDS, createJobRunner } from "./jobs/runner.js";
import { WORK_OPTIONS, WORKER_QUEUES, provisionQueues } from "./jobs/queues.js";

export interface WorkerDeps {
  boss: Pick<PgBoss, "createQueue" | "updateQueue" | "getQueue" | "work" | "send">;
  logger: Logger;
  /** `null` until the Career stores are wired (PR 2/3): queues are provisioned but not consumed. */
  career: CareerHandlers | null;
  /** Aborted by the lifecycle before pg-boss stops, so handlers end and re-enqueue their jobs. */
  shutdown?: AbortSignal;
}

/** Provisions the queues and registers the handlers. `boss.start()` must have resolved. */
export async function registerWorkers({
  boss,
  logger,
  career,
  shutdown,
}: WorkerDeps): Promise<string[]> {
  await provisionQueues(boss);
  if (career === null) {
    logger.warn({ queues: WORKER_QUEUES }, "career handlers not wired; queues provisioned only");
    return [];
  }
  const ids: string[] = [];
  for (const queue of WORKER_QUEUES) {
    const requeue = (payload: object) =>
      boss.send(queue, payload, { startAfter: CANCELLED_REQUEUE_DELAY_SECONDS });
    const runner = createJobRunner(
      queue,
      career[queue] as never,
      logger,
      requeue,
      shutdown ?? null,
    );
    ids.push(
      await boss.work(queue, { ...WORK_OPTIONS[queue], batchSize: 1, perJobResults: true }, runner),
    );
  }
  logger.info({ queues: WORKER_QUEUES }, "career workers registered");
  return ids;
}
