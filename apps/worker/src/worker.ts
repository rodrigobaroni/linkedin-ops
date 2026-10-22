/**
 * Composition of the worker process (ADR-0002 §4, amendment of 2026-10-22: a plain composition root with
 * pg-boss and Pino; a NestJS application context comes when the worker needs domain services).
 */
import type { PgBoss } from "pg-boss";
import type { Logger } from "pino";
import type { CareerHandlers } from "./career/handlers.js";
import { createJobRunner } from "./jobs/runner.js";
import { WORK_OPTIONS, WORKER_QUEUES, provisionQueues } from "./jobs/queues.js";

export interface WorkerDeps {
  boss: Pick<PgBoss, "createQueue" | "updateQueue" | "getQueue" | "work">;
  logger: Logger;
  /** `null` until the Career stores are wired (PR 2/3): queues are provisioned but not consumed. */
  career: CareerHandlers | null;
}

/** Provisions the queues and registers the handlers. `boss.start()` must have resolved. */
export async function registerWorkers({ boss, logger, career }: WorkerDeps): Promise<string[]> {
  await provisionQueues(boss);
  if (career === null) {
    logger.warn({ queues: WORKER_QUEUES }, "career handlers not wired; queues provisioned only");
    return [];
  }
  const ids: string[] = [];
  for (const queue of WORKER_QUEUES) {
    const runner = createJobRunner(queue, career[queue] as never, logger);
    ids.push(
      await boss.work(queue, { ...WORK_OPTIONS[queue], batchSize: 1, perJobResults: true }, runner),
    );
  }
  logger.info({ queues: WORKER_QUEUES }, "career workers registered");
  return ids;
}
