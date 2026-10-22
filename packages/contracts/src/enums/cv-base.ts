import { z } from "zod";

/**
 * Lifecycle of a CV base draft (career module, spec 2026-10-22 §5): the API stores the PDF text as
 * `EXTRACTING` and enqueues `cv.extract`; the worker structures it (`READY`) or gives up (`FAILED`).
 * A confirmed CV base is always `READY`.
 */
export const CvDraftStatusSchema = z
  .enum(["EXTRACTING", "READY", "FAILED"])
  .meta({ id: "CvDraftStatus" });
export const CvDraftStatus = CvDraftStatusSchema.enum;
export type CvDraftStatus = z.infer<typeof CvDraftStatusSchema>;

/** Why a draft is `FAILED`; the web offers a new upload in both cases. */
export const CvExtractionFailureSchema = z
  .enum(["EXTRACTION_FAILED", "TIMED_OUT"])
  .meta({ id: "CvExtractionFailure" });
export const CvExtractionFailure = CvExtractionFailureSchema.enum;
export type CvExtractionFailure = z.infer<typeof CvExtractionFailureSchema>;
