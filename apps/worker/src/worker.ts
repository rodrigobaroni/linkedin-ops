/**
 * Composition of the worker process (ADR-0002 §4, amendment of 2026-10-22: a plain composition root with
 * pg-boss and Pino; a NestJS application context comes when the worker needs domain services).
 */
import type { PgBoss } from "pg-boss";
import type { Logger } from "pino";
import type { WiredCareerHandlers } from "./career/handlers.js";
import { createJobRunner, type RequeueOptions } from "./jobs/runner.js";
import { WORK_OPTIONS, WORKER_QUEUES, provisionQueues } from "./jobs/queues.js";

export interface WorkerDeps {
  boss: Pick<PgBoss, "createQueue" | "updateQueue" | "getQueue" | "work" | "send">;
  logger: Logger;
  /**
   * Handlers of the queues whose stores are wired (`cv.extract` since the CV base store; `job.fetch` and
   * `cv.tailor` with career PR 3). Every queue is provisioned; only those with a handler are consumed.
   */
  career: WiredCareerHandlers | null;
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
  const wired = WORKER_QUEUES.filter((queue) => career?.[queue] !== undefined);
  const unwired = WORKER_QUEUES.filter((queue) => !wired.includes(queue));
  if (unwired.length > 0) {
    logger.warn({ queues: unwired }, "career handlers not wired; queues provisioned only");
  }
  const ids: string[] = [];
  for (const queue of wired) {
    // Same group as the original job (the runner passes it), so `groupConcurrency` keeps serializing it.
    const requeue = async (payload: object, options: RequeueOptions) => {
      const id = await boss.send(queue, payload, options);
      if (id === null) throw new Error("re-enqueue was not accepted");
      return id;
    };
    const runner = createJobRunner(
      queue,
      career?.[queue] as never,
      logger,
      requeue,
      shutdown ?? null,
    );
    ids.push(
      await boss.work(queue, { ...WORK_OPTIONS[queue], batchSize: 1, perJobResults: true }, runner),
    );
  }
  if (wired.length > 0) logger.info({ queues: wired }, "career workers registered");
  return ids;
}
