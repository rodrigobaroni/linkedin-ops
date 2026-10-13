import { z } from "zod";
import { IsoDateTimeSchema } from "../common/datetime.js";
import { RowVersionSchema, SemverSchema, UuidSchema } from "../common/ids.js";
import { DraftVersionAuthorTypeSchema, HookFormulaSchema } from "../enums/draft.js";
import { MediaFormatSchema } from "../enums/opportunity.js";
import { PromptIdSchema, QualityEvaluationSchema } from "../engine/structured-outputs.js";

export const POST_BODY_MAX_CHARS = 3000;
export const HOOK_MAX_CHARS = 210;
export const ALT_TEXT_MAX_CHARS = 300;

/** Hook with provenance (object since 2026-10-13, for audit and evals). */
export const HookSchema = z
  .strictObject({
    text: z.string().trim().min(1).max(HOOK_MAX_CHARS),
    formula: HookFormulaSchema.nullable(),
    rationale: z.string().max(500).nullable(),
  })
  .meta({ id: "Hook" });
export type Hook = z.infer<typeof HookSchema>;

/** Media attached to a version. `altText` is mandatory whenever a suggestion exists (accessibility). */
export const DraftMediaSuggestionSchema = z
  .strictObject({
    format: MediaFormatSchema,
    description: z.string().trim().min(1).max(1000),
    altText: z.string().trim().min(1).max(ALT_TEXT_MAX_CHARS),
    codeSnippet: z.string().max(4000).nullable(),
  })
  .meta({ id: "DraftMediaSuggestion" });
export type DraftMediaSuggestion = z.infer<typeof DraftMediaSuggestionSchema>;

/** Source of a factual claim: a collected item, an external URL, or both. */
export const CitationSchema = z
  .strictObject({
    sourceItemId: UuidSchema.nullable(),
    url: z.url().max(2048).nullable(),
    claim: z.string().trim().min(1).max(1000),
    quote: z.string().max(500).nullable(),
  })
  .refine((citation) => citation.sourceItemId !== null || citation.url !== null, {
    message: "A citation needs a sourceItemId or a url",
    path: ["sourceItemId"],
  })
  .meta({ id: "Citation" });
export type Citation = z.infer<typeof CitationSchema>;

export const GenerationUsageSchema = z
  .object({
    inputTokens: z.int().min(0),
    outputTokens: z.int().min(0),
    costUsd: z.number().min(0).nullable(),
  })
  .meta({ id: "GenerationUsage" });
export type GenerationUsage = z.infer<typeof GenerationUsageSchema>;

/** Reproducibility metadata of a SYSTEM-authored version (ADR-0005 §3). `usage` is only shown to OWNER. */
export const GenerationMetadataSchema = z
  .object({
    promptId: PromptIdSchema,
    promptVersion: SemverSchema,
    model: z.string().min(1).max(64),
    engineVersion: SemverSchema,
    usage: GenerationUsageSchema.nullable().optional(),
    latencyMs: z.int().min(0).nullable().optional(),
    requestId: z.string().max(128).nullable().optional(),
  })
  .meta({ id: "GenerationMetadata" });
export type GenerationMetadata = z.infer<typeof GenerationMetadataSchema>;

/** Rubric results for a version. `quality` is the full `QualityEvaluation` output when available. */
export const DraftEvalSchema = z
  .object({
    clicheScore: z.number().min(0).max(1),
    voiceMatch: z.number().min(0).max(1),
    unsupportedClaims: z.array(z.string().max(1000)),
    injectionSuspected: z.boolean(),
    quality: QualityEvaluationSchema.nullable().optional(),
  })
  .meta({ id: "DraftEval" });
export type DraftEval = z.infer<typeof DraftEvalSchema>;

/** Immutable version of a draft. Regenerating creates a new one; nothing is ever deleted. */
export const DraftVersionSchema = z
  .object({
    id: UuidSchema,
    draftId: UuidSchema,
    versionNumber: z.int().min(1),
    parentVersionId: UuidSchema.nullable(),
    authorType: DraftVersionAuthorTypeSchema,
    body: z.string().min(1).max(POST_BODY_MAX_CHARS).describe("Full post text"),
    hooks: z.array(HookSchema).max(10),
    mediaSuggestion: DraftMediaSuggestionSchema.nullable(),
    citations: z.array(CitationSchema).max(50),
    storyEntryIds: z.array(UuidSchema).max(20),
    mediaAssetIds: z.array(UuidSchema).max(10),
    generation: GenerationMetadataSchema.nullable().describe("Only for SYSTEM versions"),
    eval: DraftEvalSchema.nullable(),
    createdAt: IsoDateTimeSchema,
  })
  .refine((version) => version.authorType === "SYSTEM" || version.generation === null, {
    message: "USER versions carry no generation metadata",
    path: ["generation"],
  })
  .meta({ id: "DraftVersion" });
export type DraftVersion = z.infer<typeof DraftVersionSchema>;

/** Compact version embedded in draft lists. */
export const DraftVersionSummarySchema = z
  .object({
    id: UuidSchema,
    draftId: UuidSchema,
    versionNumber: z.int().min(1),
    authorType: DraftVersionAuthorTypeSchema,
    bodyExcerpt: z.string().max(280),
    createdAt: IsoDateTimeSchema,
  })
  .meta({ id: "DraftVersionSummary" });
export type DraftVersionSummary = z.infer<typeof DraftVersionSummarySchema>;

/** `POST /drafts/{id}/versions`: manual edit → new version with `authorType = USER`. */
export const DraftVersionCreateInputSchema = z
  .strictObject({
    body: z.string().min(1).max(POST_BODY_MAX_CHARS),
    hooks: z.array(HookSchema).max(10),
    mediaSuggestion: DraftMediaSuggestionSchema.nullable().optional(),
    citations: z.array(CitationSchema).max(50),
    expectedRowVersion: RowVersionSchema,
  })
  .meta({ id: "DraftVersionCreateInput" });
export type DraftVersionCreateInput = z.infer<typeof DraftVersionCreateInputSchema>;
