/**
 * Queue provisioning from the contracts catalogue (ADR-0002 §2) and per-queue work options. Only queues this
 * worker consumes are provisioned; each gets its dead-letter queue first.
 */
import { QUEUES, type QueueName } from "@linkedin-ops/contracts";
import type { PgBoss, WorkOptions } from "pg-boss";

export { PGBOSS_SCHEMA_NAME } from "@linkedin-ops/contracts";

/** Career queues: concurrency 3 (spec §4). `job.fetch` also runs 1 at a time per group (ADR-0008 §4). */
export const WORK_OPTIONS = {
  "cv.extract": { localConcurrency: 3 },
  "job.fetch": { localConcurrency: 3, groupConcurrency: 1 },
  "cv.tailor": { localConcurrency: 3 },
  // T-063: one purge at a time.
  "retention.purge": { localConcurrency: 1 },
} as const satisfies Partial<Record<QueueName, WorkOptions>>;

export type WorkerQueueName = keyof typeof WORK_OPTIONS;
export const WORKER_QUEUES = Object.keys(WORK_OPTIONS) as WorkerQueueName[];

/**
 * Creates or updates each queue and its dead-letter queue. Idempotent: safe on every boot. Producers of
 * `job.fetch` must send `group: { id: <registrable domain> }` so `groupConcurrency` serializes per domain.
 */
export async function provisionQueues(
  boss: Pick<PgBoss, "createQueue" | "updateQueue" | "getQueue">,
  names: readonly QueueName[] = WORKER_QUEUES,
): Promise<void> {
  for (const name of names) {
    const definition = QUEUES[name];
    if ((await boss.getQueue(definition.deadLetter)) === null) {
      await boss.createQueue(definition.deadLetter, { retryLimit: 0 });
    }
    const options = {
      retryLimit: definition.retryLimit,
      retryDelay: definition.retryDelaySeconds,
      retryBackoff: definition.retryBackoff,
      expireInSeconds: definition.expireInSeconds,
    };
    if ((await boss.getQueue(name)) === null) {
      await boss.createQueue(name, { ...options, deadLetter: definition.deadLetter });
    } else {
      await boss.updateQueue(name, { ...options, deadLetter: definition.deadLetter });
    }
  }
}
