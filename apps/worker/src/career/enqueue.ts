/**
 * Producer side of `cv.tailor` inside the worker: `PrismaJobPostingStore.completeExtraction` stores the extraction
 * and enqueues the tailoring in the same transaction (ADR-0002 §3), through this adapter's `send(..., { db })`.
 * The payload carries ids and the posting's cycle (`attempt`) only, never posting or CV text.
 */
import { CvTailorPayloadSchema, QUEUES } from "@linkedin-ops/contracts";
import type { CvTailorEnqueue } from "@linkedin-ops/domain";
import type { PgBoss } from "pg-boss";

const CV_TAILOR = QUEUES["cv.tailor"];

export function pgBossCvTailorEnqueue(boss: Pick<PgBoss, "send">): CvTailorEnqueue {
  return async (db, job) => {
    const payload = CvTailorPayloadSchema.parse({
      schemaVersion: 1,
      correlationId: job.correlationId ?? `job_posting:${job.jobPostingId}`,
      requestedBy: { type: "SYSTEM", id: "worker" },
      jobPostingId: job.jobPostingId,
      attempt: job.attempt,
    });
    const jobId = await boss.send(CV_TAILOR.name, payload, {
      db,
      singletonKey: CV_TAILOR.singletonKeyFrom?.(payload),
    });
    // The queues use the standard policy (singletonKey never deduplicates): null means a job not created, an
    // internal error that rolls the extraction back with it.
    if (jobId === null) throw new Error("cv.tailor job was not created");
    return jobId;
  };
}
