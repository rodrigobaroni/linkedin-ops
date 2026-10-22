import { z } from "zod";
import { CvStructuredSchema, ParseWarningSchema } from "../career/schemas.js";
import { AsyncAcceptedSchema } from "../common/async.js";
import { IsoDateTimeSchema } from "../common/datetime.js";
import { UuidSchema } from "../common/ids.js";
import { CvDraftStatusSchema, CvExtractionFailureSchema } from "../enums/cv-base.js";

/**
 * Upload limits enforced by the API on `POST /career/cv` (multipart, spec 2026-10-22 §5). Only a PDF
 * (checked by its signature, not by the name or the declared type) with a text layer is accepted; the
 * original file is discarded right after its text is extracted.
 */
export const CV_UPLOAD_LIMITS = {
  maxBytes: 5 * 1024 * 1024,
  fieldName: "file",
  mimeType: "application/pdf",
  maxPages: 20,
  /** Extracted text kept until `cv.extract` structures it. */
  maxTextChars: 60_000,
} as const;

/** The pending draft: at most one per user; a new upload replaces it. */
export const CvDraftSchema = z
  .object({
    id: UuidSchema,
    version: z.int().min(1),
    status: CvDraftStatusSchema,
    failureReason: CvExtractionFailureSchema.nullable().describe("Set only when FAILED"),
    content: CvStructuredSchema.nullable().describe("Set only when READY"),
    parseWarnings: z
      .array(ParseWarningSchema)
      .max(50)
      .optional()
      .describe("What the extraction could not read unambiguously; shown on review"),
    injectionSuspected: z
      .boolean()
      .optional()
      .describe(
        "The extraction found text that tries to instruct the model; confirming needs `acknowledgeInjection`",
      ),
    injectionEvidence: z
      .string()
      .max(500)
      .nullable()
      .optional()
      .describe("Offending excerpt of the CV, set only when `injectionSuspected`"),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .meta({ id: "CvDraft" });
export type CvDraft = z.infer<typeof CvDraftSchema>;

/** The confirmed, active CV base used for tailoring. */
export const CvBaseSchema = z
  .object({
    id: UuidSchema,
    version: z.int().min(1),
    content: CvStructuredSchema,
    confirmedAt: IsoDateTimeSchema,
    createdAt: IsoDateTimeSchema,
  })
  .meta({ id: "CvBase" });
export type CvBase = z.infer<typeof CvBaseSchema>;

/** `GET /career/cv`: the active CV base and the pending draft, each possibly absent. */
export const CvBaseStateSchema = z
  .object({
    active: CvBaseSchema.nullable(),
    draft: CvDraftSchema.nullable(),
  })
  .meta({ id: "CvBaseState" });
export type CvBaseState = z.infer<typeof CvBaseStateSchema>;

/** `202` of the upload: `id`/`status` are the draft's, `jobId` the `cv.extract` job. */
export const CvUploadAcceptedSchema = AsyncAcceptedSchema.extend({
  draft: CvDraftSchema,
}).meta({ id: "CvUploadAccepted" });
export type CvUploadAccepted = z.infer<typeof CvUploadAcceptedSchema>;

/**
 * Confirms the reviewed draft; `draftId` guards against confirming a draft replaced meanwhile. A draft with
 * `injectionSuspected` is only activated with `acknowledgeInjection: true` (ADR-0005 §4: fail closed).
 */
export const CvConfirmInputSchema = z
  .strictObject({
    draftId: UuidSchema,
    content: CvStructuredSchema,
    acknowledgeInjection: z
      .boolean()
      .optional()
      .describe("The owner reviewed the excerpt flagged as possible prompt injection"),
  })
  .meta({ id: "CvConfirmInput" });
export type CvConfirmInput = z.infer<typeof CvConfirmInputSchema>;
