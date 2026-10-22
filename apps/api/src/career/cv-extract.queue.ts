import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { CvExtractPayloadSchema, type CvExtractPayload } from "@linkedin-ops/contracts";
import type { Logger } from "pino";
import { API_LOGGER } from "../logging/logger.js";

/** Injection token of the `cv.extract` producer. */
export const CV_EXTRACT_QUEUE = Symbol("CV_EXTRACT_QUEUE");

/**
 * Producer side of `cv.extract` (contracts.md §6.1). The payload carries only the draft id: the PDF text
 * stays in `cv_bases.extracted_text` and never goes into the job table.
 */
export interface CvExtractQueue {
  /** Enqueues the job and returns its id. */
  enqueue(payload: CvExtractPayload): Promise<{ jobId: string }>;
}

/**
 * Placeholder until the pg-boss producer of career PR 1 is merged: validates the payload as the real
 * producer will and answers a synthetic job id, but nothing consumes it — the draft stays `EXTRACTING`
 * and is settled as `TIMED_OUT` (`CV_EXTRACTION_STALE_MS`).
 * TODO(career PR 1): bind `CV_EXTRACT_QUEUE` to the pg-boss producer and delete this class.
 */
@Injectable()
export class UnwiredCvExtractQueue implements CvExtractQueue {
  constructor(@Inject(API_LOGGER) private readonly logger: Logger) {}

  async enqueue(payload: CvExtractPayload): Promise<{ jobId: string }> {
    const valid = CvExtractPayloadSchema.parse(payload);
    this.logger.warn(
      { queue: "cv.extract", cvBaseId: valid.cvBaseId, correlationId: valid.correlationId },
      "cv.extract producer not wired yet (career PR 1); job not delivered",
    );
    return { jobId: randomUUID() };
  }
}
