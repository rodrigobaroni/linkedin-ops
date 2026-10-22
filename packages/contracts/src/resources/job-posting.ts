import { z } from "zod";
import {
  JobPostingExtractedSchema,
  MatchReportSchema,
  TailoredCvContentSchema,
} from "../career/schemas.js";
import { AsyncAcceptedSchema } from "../common/async.js";
import { IsoDateTimeSchema } from "../common/datetime.js";
import { UuidSchema } from "../common/ids.js";
import { PaginationQuerySchema } from "../common/pagination.js";
import {
  JobPostingFailureSchema,
  JobPostingSourceKindSchema,
  JobPostingStatusSchema,
} from "../enums/job-posting.js";

/**
 * Limits of `POST /career/batches` and `POST /career/jobs/{id}/text` (spec 2026-10-22 §3, §7, §9). A batch has
 * 1 to 20 links (Maestro decision 2026-10-22; "5–20" in ADR-0008 is the typical use, not the contract).
 * Pasted text is bounded like a fetched page (the engine's `JOB_TEXT_MAX_CHARS`).
 */
export const JOB_POSTING_LIMITS = {
  minLinks: 1,
  maxLinks: 20,
  maxUrlChars: 2048,
  minTextChars: 200,
  maxTextChars: 20_000,
} as const;

/**
 * Link of a job posting: absolute `http(s)` with a domain name (no IP literal, no `localhost`) and no
 * credentials. The server normalizes it (no fragment nor tracking parameters) and `job.fetch` revalidates it
 * at every hop (ADR-0008 §5).
 */
export const JobPostingUrlSchema = z
  .url({ protocol: /^https?$/, hostname: z.regexes.domain })
  .max(JOB_POSTING_LIMITS.maxUrlChars)
  // No userinfo (`user:pass@`) in the authority. Contracts are isomorphic: no `URL` global here.
  .refine(
    (value) => !/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*@/i.test(value),
    "URL must not carry credentials",
  )
  .describe("Absolute http(s) link of a job posting")
  .meta({ id: "JobPostingUrl" });

/** One link per line in the web; duplicates are merged by the server (by normalized URL). */
export const TailoringBatchInputSchema = z
  .strictObject({
    urls: z
      .array(z.string().trim().pipe(JobPostingUrlSchema))
      .min(JOB_POSTING_LIMITS.minLinks)
      .max(JOB_POSTING_LIMITS.maxLinks),
  })
  .meta({ id: "TailoringBatchInput" });
export type TailoringBatchInput = z.infer<typeof TailoringBatchInputSchema>;

/** Text of the posting pasted by the owner; posting text is untrusted data, never instructions. */
export const JobPostingTextInputSchema = z
  .strictObject({
    text: z
      .string()
      .trim()
      .min(JOB_POSTING_LIMITS.minTextChars)
      .max(JOB_POSTING_LIMITS.maxTextChars)
      .refine((value) => !value.includes("\u0000"), "Text must not contain NUL characters"),
  })
  .meta({ id: "JobPostingTextInput" });
export type JobPostingTextInput = z.infer<typeof JobPostingTextInputSchema>;

export const JobPostingListQuerySchema = PaginationQuerySchema.extend({
  cursor: UuidSchema.optional().describe("Id of the last posting of the previous page"),
}).meta({ id: "JobPostingListQuery" });
export type JobPostingListQuery = z.infer<typeof JobPostingListQuerySchema>;

/** A posting in the list (status polling): no posting text, CV content nor report. */
export const JobPostingSummarySchema = z
  .object({
    id: UuidSchema,
    batchId: UuidSchema,
    url: z.string().max(JOB_POSTING_LIMITS.maxUrlChars).describe("Normalized link"),
    source: JobPostingSourceKindSchema,
    status: JobPostingStatusSchema,
    failureReason: JobPostingFailureSchema.nullable().describe("Set only when FAILED"),
    title: z.string().max(200).nullable().describe("From the extraction (from ANALYZING on)"),
    company: z.string().max(200).nullable(),
    baseScore: z
      .int()
      .min(0)
      .max(100)
      .nullable()
      .describe("Match of the base CV before anything is added; set only when READY"),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .meta({ id: "JobPostingSummary" });
export type JobPostingSummary = z.infer<typeof JobPostingSummarySchema>;

/** The CV tailored to a posting, with provenance per segment (review only, never in the PDF). */
export const JobPostingTailoringSchema = z
  .object({
    cvBaseId: UuidSchema.describe("CV base version the tailoring used"),
    generatedWithPreviousCv: z
      .boolean()
      .describe("The active CV base changed after this tailoring; reprocessing uses the new one"),
    content: TailoredCvContentSchema,
    report: MatchReportSchema,
    generatedAt: IsoDateTimeSchema,
  })
  .meta({ id: "JobPostingTailoring" });
export type JobPostingTailoring = z.infer<typeof JobPostingTailoringSchema>;

export const JobPostingDetailSchema = JobPostingSummarySchema.extend({
  extracted: JobPostingExtractedSchema.nullable().describe("Set from ANALYZING on"),
  droppedRequirementCount: z
    .int()
    .min(0)
    .nullable()
    .describe("Requirements dropped because their evidence was not found in the posting"),
  injectionSuspected: z
    .boolean()
    .describe("The posting text tries to instruct the model (treated as data either way)"),
  injectionEvidence: z
    .string()
    .max(500)
    .nullable()
    .describe("Offending excerpt of the posting, set only when injectionSuspected"),
  fetchedAt: IsoDateTimeSchema.nullable(),
  tailoring: JobPostingTailoringSchema.nullable().describe("Set only when READY"),
}).meta({ id: "JobPostingDetail" });
export type JobPostingDetail = z.infer<typeof JobPostingDetailSchema>;

/**
 * `202` of `POST /career/batches`, extending `AsyncAccepted`: `id` is the batch, `status` is `FETCHING` when at
 * least one posting was queued and `FAILED` when every link was blocked, `jobId` the first `job.fetch` (null
 * when none). A LinkedIn link that is not a job view becomes a posting `FAILED`/`FETCH_BLOCKED` with no job
 * (ADR-0008 §1: never fetched, no quota spent; the web offers pasting the text). `jobIds` lists one job per
 * queued posting, in `postings` order.
 */
export const TailoringBatchAcceptedSchema = AsyncAcceptedSchema.extend({
  id: UuidSchema.describe("Id of the batch"),
  status: z
    .enum(["FETCHING", "FAILED"])
    .describe("FETCHING when at least one posting was queued; FAILED when every link was blocked"),
  jobId: z.string().min(1).nullable().describe("First job.fetch of the batch (null when none)"),
  batchId: UuidSchema,
  cvBaseId: UuidSchema.describe("CV base active when the batch was created"),
  duplicatesMerged: z.int().min(0).describe("Links that normalized to one already in the batch"),
  blocked: z
    .int()
    .min(0)
    .describe("LinkedIn links that are not a job view, created FAILED/FETCH_BLOCKED without a job"),
  postings: z.array(JobPostingSummarySchema).min(1).max(JOB_POSTING_LIMITS.maxLinks),
  jobIds: z.array(z.string().min(1)).max(JOB_POSTING_LIMITS.maxLinks),
}).meta({ id: "TailoringBatchAccepted" });
export type TailoringBatchAccepted = z.infer<typeof TailoringBatchAcceptedSchema>;

/** `202` of pasting text or reprocessing: `id`/`status` are the posting's, `jobId` the job enqueued. */
export const JobPostingAcceptedSchema = AsyncAcceptedSchema.extend({
  status: JobPostingStatusSchema,
  posting: JobPostingSummarySchema,
}).meta({ id: "JobPostingAccepted" });
export type JobPostingAccepted = z.infer<typeof JobPostingAcceptedSchema>;
