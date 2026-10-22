/**
 * Structured Outputs of the editorial engine (docs/editorial/structured-outputs.md, owner Pena).
 *
 * These schemas describe what the model returns (OpenAI Responses API, `json_schema` strict). They keep
 * Pena's field names; `packages/contracts` resource names prevail in persistence/API and the engine maps
 * one to the other (ADR-0005 §9: `freshness → recency`, `sourceQuality → sourceTrust`,
 * `relevance → pillarFit + audienceFit`; `novelty` is computed, never asked of the model).
 *
 * Strict-mode rules: every object closed, every property required, optionals expressed as `.nullable()`.
 * Limits that strict mode may not enforce (`min`, `max`, `regex`) are still validated by Zod after parse.
 */
import { z } from "zod";
import {
  CvExtractionOutputSchema,
  CvHumanizationOutputSchema,
  CvTailoringOutputSchema,
  JobExtractionOutputSchema,
} from "../career/schemas.js";
import { toStructuredOutputSchema, type StructuredOutputSchema } from "../common/json-schema.js";
import { HookFormulaSchema } from "../enums/draft.js";
import { LanguageSchema } from "../enums/language.js";
import { SuggestedFormatSchema } from "../enums/opportunity.js";

export const STRUCTURED_OUTPUT_SCHEMA_VERSION = "1.0" as const;
const SchemaVersionSchema = z.literal(STRUCTURED_OUTPUT_SCHEMA_VERSION);

const Unit = z.number().min(0).max(1);
const Text = z.string();
const NullableText = z.string().nullable();

/** Prompt ids of the engine registry (ADR-0005 §3; `promptId@version`). */
export const PromptIdSchema = z
  .enum([
    "opportunity-classify",
    "brief",
    "draft-writer",
    "humanize",
    "factcheck",
    "hooks",
    "media",
    "quality",
    "voice-extract",
    "cv-extract",
    "job-extract",
    "cv-tailor",
    "cv-humanize",
  ])
  .meta({ id: "PromptId" });
export const PromptId = PromptIdSchema.enum;
export type PromptId = z.infer<typeof PromptIdSchema>;

// ---------------------------------------------------------------------------------------------------
// §1.1 Shared definitions
// ---------------------------------------------------------------------------------------------------

export const SourceRefSchema = z
  .object({
    sourceId: Text.describe("Id of the normalized source (system)."),
    usedFor: Text.describe("What the draft took from it, in one sentence."),
    quote: NullableText.describe("Literal excerpt of up to 240 characters, if quoted."),
  })
  .meta({ id: "SourceRef" });
export type SourceRef = z.infer<typeof SourceRefSchema>;

export const FactKindSchema = z
  .enum(["number", "entity", "date", "event", "opinion", "experience"])
  .meta({ id: "FactKind" });
export type FactKind = z.infer<typeof FactKindSchema>;

export const FactRefTypeSchema = z
  .enum(["story-bank", "source", "author-input", "none"])
  .meta({ id: "FactRefType" });
export type FactRefType = z.infer<typeof FactRefTypeSchema>;

export const FactStatusSchema = z
  .enum(["supported", "approximate", "unsupported"])
  .meta({ id: "FactStatus" });
export type FactStatus = z.infer<typeof FactStatusSchema>;

export const FactRefSchema = z
  .object({
    claim: Text.describe("The claim exactly as it appears in the text."),
    kind: FactKindSchema,
    refType: FactRefTypeSchema,
    refId: NullableText.describe("storyBankItemId, sourceId or authorInputId."),
    status: FactStatusSchema,
  })
  .meta({ id: "FactRef" });
export type FactRef = z.infer<typeof FactRefSchema>;

export const EvidenceLabelSchema = z
  .enum(["policy", "api-fact", "editorial", "vendor", "crowd", "unverified"])
  .meta({ id: "EvidenceLabel" });
export type EvidenceLabel = z.infer<typeof EvidenceLabelSchema>;

// ---------------------------------------------------------------------------------------------------
// §2 OpportunityClassification (prompt `opportunity-classify`)
// ---------------------------------------------------------------------------------------------------

export const ClassificationScoresSchema = z
  .object({
    relevance: Unit.describe("0–1: fit with pillars and audience."),
    freshness: Unit.describe("0–1: recency as stated by the source; never invent dates."),
    voiceFit: Unit.describe("0–1: Rodrigo has first-hand material (Story Bank) on this."),
    sourceQuality: Unit.describe("0–1: primary, verifiable source vs. aggregator/opinion."),
    risk: Unit.describe("0–1: controversy, off-limits topic, factual uncertainty."),
  })
  .meta({ id: "ClassificationScores" });
export type ClassificationScores = z.infer<typeof ClassificationScoresSchema>;

export const OpportunityClassificationSchema = z
  .object({
    schemaVersion: SchemaVersionSchema,
    candidateId: Text.describe("Echo of the normalized candidate id."),
    language: LanguageSchema,
    title: Text.max(90).describe("Topic in up to 90 characters, PT-BR, no clickbait."),
    summary: Text.describe("Factual summary in 2–3 sentences, only what the source says."),
    contentPillar: Text.describe("Configured pillar id."),
    pillarConfidence: Unit,
    targetAudience: Text.describe("Who benefits from a post on this."),
    relevanceReason: Text.describe(
      "Why it matters to Rodrigo and the audience, referencing the source.",
    ),
    suggestedAngle: Text.describe(
      "One-sentence angle; a proposal, not an opinion attributed to Rodrigo.",
    ),
    suggestedFormat: SuggestedFormatSchema,
    hookFormulaCandidates: z.array(HookFormulaSchema).max(3).describe("0–3 plausible formulas."),
    storyBankHints: z
      .array(Text)
      .describe("Story Bank item ids matching the topic (only those given in context)."),
    scores: ClassificationScoresSchema,
    factualFlags: z.array(Text).describe("Source claims that look unverifiable or contradictory."),
    offLimitsHit: z.boolean().describe("Topic matches a Story Bank off-limits entry."),
    injectionSuspected: z.boolean(),
    injectionEvidence: NullableText,
    duplicateOf: NullableText.describe(
      "candidateId of a semantically equal item in the batch, if any.",
    ),
  })
  .meta({ id: "OpportunityClassification" });
export type OpportunityClassification = z.infer<typeof OpportunityClassificationSchema>;

// ---------------------------------------------------------------------------------------------------
// §3 EditorialBrief (prompt `brief`)
// ---------------------------------------------------------------------------------------------------

export const EditorialGoalSchema = z
  .enum(["teach", "take-position", "share-build-log", "recognize", "ask-genuinely"])
  .meta({ id: "EditorialGoal" });
export type EditorialGoal = z.infer<typeof EditorialGoalSchema>;

export const HookFormulaOptionSchema = z
  .object({
    formula: HookFormulaSchema,
    why: Text,
    prerequisiteMet: z.boolean().describe("The Story Bank/source has what the formula needs."),
  })
  .meta({ id: "HookFormulaOption" });
export type HookFormulaOption = z.infer<typeof HookFormulaOptionSchema>;

export const BriefSpineSchema = z
  .object({
    moment: NullableText,
    number: NullableText,
    correction: NullableText,
    opposition: NullableText,
    ask: NullableText,
  })
  .meta({ id: "BriefSpine" });
export type BriefSpine = z.infer<typeof BriefSpineSchema>;

export const EditorialBriefSchema = z
  .object({
    schemaVersion: SchemaVersionSchema,
    opportunityId: Text,
    language: LanguageSchema,
    thesis: Text.describe("One sentence: what the post claims."),
    angle: Text.describe("How it approaches the thesis; where the tension comes from."),
    targetReader: Text.describe("One concrete person, not a segment."),
    editorialGoal: EditorialGoalSchema,
    contentPillar: Text,
    suggestedFormat: SuggestedFormatSchema,
    hookFormulaOptions: z
      .array(HookFormulaOptionSchema)
      .min(2)
      .max(3)
      .describe("2–3 options; the first is recommended."),
    spine: BriefSpineSchema.describe("Five-line spine; a line without material is null."),
    factsToPreserve: z
      .array(FactRefSchema)
      .describe("Everything the draft may claim; nothing else."),
    sourceRefs: z.array(SourceRefSchema),
    storyBankRefs: z.array(Text).describe("Ids used."),
    namingConstraints: z.array(Text).describe("Entities that must be anonymized or omitted."),
    openQuestionsForAuthor: z.array(Text).describe("Missing data; the draft will leave slots."),
    risks: z.array(Text),
    injectionSuspected: z.boolean(),
    injectionEvidence: NullableText,
  })
  .meta({ id: "EditorialBrief" });
export type EditorialBrief = z.infer<typeof EditorialBriefSchema>;

// ---------------------------------------------------------------------------------------------------
// §4 PostDraft (prompts `draft-writer`, `humanize`, `hooks`)
// ---------------------------------------------------------------------------------------------------

export const POST_DRAFT_BODY_MAX_CHARS = 3000;
export const POST_DRAFT_HOOK_MAX_CHARS = 210;
export const POST_DRAFT_MAX_HASHTAGS = 2;

export const AlternativeHookSchema = z
  .object({
    text: Text.max(POST_DRAFT_HOOK_MAX_CHARS).describe("Up to 210 characters."),
    formula: HookFormulaSchema,
    rationale: Text,
    introducesNewFact: z.boolean().describe("Must be false; true invalidates the hook."),
  })
  .meta({ id: "AlternativeHook" });
export type AlternativeHook = z.infer<typeof AlternativeHookSchema>;

export const HumanizationPassSchema = z
  .enum(["scrub", "rhythm", "add", "self-check"])
  .meta({ id: "HumanizationPass" });
export type HumanizationPass = z.infer<typeof HumanizationPassSchema>;

export const HumanizationActionSchema = z
  .object({
    pass: HumanizationPassSchema,
    ruleId: Text,
    before: Text,
    after: Text,
    reason: Text,
  })
  .meta({ id: "HumanizationAction" });
export type HumanizationAction = z.infer<typeof HumanizationActionSchema>;

export const HumanizationReportSchema = z
  .object({
    promptId: PromptIdSchema,
    paragraphDensity: z.array(z.int()).describe("Markers per paragraph after the pass."),
    actions: z.array(HumanizationActionSchema),
    voiceConflicts: z
      .array(Text)
      .describe("Terms in vocabularyUsed that collided with the list; left unchanged."),
    overCorrectionGuardTriggered: z.boolean(),
    factsChanged: z.boolean().describe("Must be false; true reverts the pass."),
  })
  .meta({ id: "HumanizationReport" });
export type HumanizationReport = z.infer<typeof HumanizationReportSchema>;

export const PostDraftSchema = z
  .object({
    schemaVersion: SchemaVersionSchema,
    opportunityId: Text,
    briefVersion: Text,
    language: LanguageSchema,
    formula: HookFormulaSchema,
    hook: Text.max(POST_DRAFT_HOOK_MAX_CHARS).describe(
      "Opening lines, up to 210 characters, a claim or a number.",
    ),
    body: Text.min(1)
      .max(POST_DRAFT_BODY_MAX_CHARS)
      .describe(
        "Full post ready to publish, hook included, line breaks and hashtags at the end. Max 3,000 characters.",
      ),
    charCount: z.int().min(0),
    hashtags: z
      .array(Text.regex(/^[^#\s]+$/))
      .max(POST_DRAFT_MAX_HASHTAGS)
      .describe("0–2, without #."),
    alternativeHooks: z
      .array(AlternativeHookSchema)
      .min(3)
      .max(5)
      .describe("3–5 items; at least one with a different formula."),
    sourcesUsed: z.array(SourceRefSchema),
    factRefs: z
      .array(FactRefSchema)
      .describe("Every number, entity, date, experience and opinion in the body."),
    slots: z.array(Text).describe("{{...}} markers left in the text for missing data."),
    openQuestionsForAuthor: z.array(Text),
    firstCommentSuggestion: NullableText.describe(
      "Suggested first comment (e.g. source link). Posting it is a separate, approved step.",
    ),
    humanization: HumanizationReportSchema,
    injectionSuspected: z.boolean(),
    injectionEvidence: NullableText,
  })
  .superRefine((draft, ctx) => {
    draft.alternativeHooks.forEach((hook, index) => {
      if (hook.introducesNewFact) {
        ctx.addIssue({
          code: "custom",
          path: ["alternativeHooks", index, "introducesNewFact"],
          message: "An alternative hook must not introduce a new fact",
        });
      }
    });
    if (draft.humanization.factsChanged) {
      ctx.addIssue({
        code: "custom",
        path: ["humanization", "factsChanged"],
        message: "Humanization must not change facts",
      });
    }
  })
  .meta({ id: "PostDraft" });
export type PostDraft = z.infer<typeof PostDraftSchema>;

// ---------------------------------------------------------------------------------------------------
// §5 MediaSuggestion (prompt `media`) — model output; the API DTO is `DraftMediaSuggestion`
// ---------------------------------------------------------------------------------------------------

export const MediaSuggestionTypeSchema = z
  .enum(["none", "code-card", "quote-card", "carousel", "author-image"])
  .meta({ id: "MediaSuggestionType" });
export type MediaSuggestionType = z.infer<typeof MediaSuggestionTypeSchema>;

export const CodeCardSuggestionSchema = z
  .object({
    language: Text.describe("Snippet language (e.g. typescript)."),
    title: Text,
    code: Text.describe(
      "Only code that is in the post, the source or provided by Rodrigo; up to 25 lines.",
    ),
    caption: NullableText,
    sourceRef: NullableText.describe(
      "Where the code came from (sourceId/storyBankItemId/authorInputId).",
    ),
  })
  .meta({ id: "CodeCardSuggestion" });
export type CodeCardSuggestion = z.infer<typeof CodeCardSuggestionSchema>;

export const QuoteCardSuggestionSchema = z
  .object({
    text: Text.max(200).describe("A line from the post itself, up to 200 characters."),
    attribution: Text.describe("Rodrigo's name/handle (from renderTokens)."),
  })
  .meta({ id: "QuoteCardSuggestion" });
export type QuoteCardSuggestion = z.infer<typeof QuoteCardSuggestionSchema>;

export const CarouselSlideSchema = z
  .object({
    title: Text.describe("Up to 8 words."),
    body: Text.describe("Up to 12 words."),
  })
  .meta({ id: "CarouselSlide" });
export type CarouselSlide = z.infer<typeof CarouselSlideSchema>;

export const CarouselSuggestionSchema = z
  .object({
    slides: z
      .array(CarouselSlideSchema)
      .min(6)
      .max(9)
      .describe("6–9 slides; content only from the post."),
  })
  .meta({ id: "CarouselSuggestion" });
export type CarouselSuggestion = z.infer<typeof CarouselSuggestionSchema>;

const MEDIA_SUGGESTION_SLOT: Record<
  MediaSuggestionType,
  "codeCard" | "quoteCard" | "carousel" | "authorImageRequest" | null
> = {
  none: null,
  "code-card": "codeCard",
  "quote-card": "quoteCard",
  carousel: "carousel",
  "author-image": "authorImageRequest",
};

export const MediaSuggestionOutputSchema = z
  .object({
    schemaVersion: SchemaVersionSchema,
    type: MediaSuggestionTypeSchema,
    rationale: Text.describe("Why this media (or none)."),
    altText: Text.max(300)
      .nullable()
      .describe("Required when type != none. Accessible description, up to 300 characters."),
    codeCard: CodeCardSuggestionSchema.nullable(),
    quoteCard: QuoteCardSuggestionSchema.nullable(),
    carousel: CarouselSuggestionSchema.nullable(),
    authorImageRequest: NullableText.describe(
      "Ask Rodrigo for a real photo/screenshot when the right media cannot be generated.",
    ),
  })
  .superRefine((media, ctx) => {
    const expected = MEDIA_SUGGESTION_SLOT[media.type];
    if (media.type !== "none" && media.altText === null) {
      ctx.addIssue({
        code: "custom",
        path: ["altText"],
        message: "altText is required when type != none",
      });
    }
    for (const slot of ["codeCard", "quoteCard", "carousel", "authorImageRequest"] as const) {
      const filled = media[slot] !== null;
      if (slot === expected && !filled) {
        ctx.addIssue({
          code: "custom",
          path: [slot],
          message: `${slot} is required when type = ${media.type}`,
        });
      }
      if (slot !== expected && filled) {
        ctx.addIssue({
          code: "custom",
          path: [slot],
          message: `${slot} must be null when type = ${media.type}`,
        });
      }
    }
  })
  .meta({ id: "MediaSuggestionOutput" });
export type MediaSuggestionOutput = z.infer<typeof MediaSuggestionOutputSchema>;

// ---------------------------------------------------------------------------------------------------
// §6 QualityEvaluation (prompt `quality`) — also the content of `DraftVersion.eval.quality`
// ---------------------------------------------------------------------------------------------------

export const QualityVerdictSchema = z.enum(["pass", "warn", "fail"]).meta({ id: "QualityVerdict" });
export type QualityVerdict = z.infer<typeof QualityVerdictSchema>;

const RubricScore = z.int().min(1).max(5).describe("1–5");

export const QualityScoresSchema = z
  .object({
    factualFidelity: RubricScore,
    noInventedExperience: RubricScore,
    naturalness: RubricScore,
    voiceMatch: RubricScore,
    specificity: RubricScore,
    structureAndHook: RubricScore,
    editorialSafety: RubricScore,
    repetition: RubricScore,
  })
  .meta({ id: "QualityScores" });
export type QualityScores = z.infer<typeof QualityScoresSchema>;

/** Blocker or warning. */
export const QualityFindingSchema = z
  .object({
    ruleId: Text,
    evidenceLabel: EvidenceLabelSchema,
    excerpt: Text,
    message: Text.describe("PT-BR, for the card."),
    suggestedFix: NullableText,
  })
  .meta({ id: "QualityFinding" });
export type QualityFinding = z.infer<typeof QualityFindingSchema>;

export const FabricationSuspectSchema = z
  .object({
    excerpt: Text,
    reason: Text,
  })
  .meta({ id: "FabricationSuspect" });
export type FabricationSuspect = z.infer<typeof FabricationSuspectSchema>;

export const ClicheCategorySchema = z
  .enum([
    "vocabulary",
    "grammar",
    "reveal-bridge",
    "sincerity",
    "opener",
    "closer",
    "rhythm",
    "emoji",
    "triad",
    "em-dash",
  ])
  .meta({ id: "ClicheCategory" });
export type ClicheCategory = z.infer<typeof ClicheCategorySchema>;

export const ClicheHitSchema = z
  .object({
    excerpt: Text,
    category: ClicheCategorySchema,
    paragraphIndex: z.int().min(0),
  })
  .meta({ id: "ClicheHit" });
export type ClicheHit = z.infer<typeof ClicheHitSchema>;

export const ReadsAsSchema = z.enum(["human", "mixed", "ai"]).meta({ id: "ReadsAs" });
export type ReadsAs = z.infer<typeof ReadsAsSchema>;

export const QualityEvaluationSchema = z
  .object({
    schemaVersion: SchemaVersionSchema,
    draftVersionId: Text,
    language: LanguageSchema,
    verdict: QualityVerdictSchema,
    scores: QualityScoresSchema,
    blockers: z.array(QualityFindingSchema),
    warnings: z.array(QualityFindingSchema),
    fabricationSuspects: z
      .array(FabricationSuspectSchema)
      .describe("Claims without a ref, or whose ref does not support the text."),
    clicheHits: z.array(ClicheHitSchema),
    readsAs: ReadsAsSchema.describe("Estimated human read; not a detector score."),
    injectionSuspected: z.boolean(),
    injectionEvidence: NullableText,
    summaryForCard: Text.describe("Two PT-BR sentences for the Studio."),
  })
  .meta({ id: "QualityEvaluation" });
export type QualityEvaluation = z.infer<typeof QualityEvaluationSchema>;

// ---------------------------------------------------------------------------------------------------
// §7 VoiceProfileExtraction (prompt `voice-extract`)
// ---------------------------------------------------------------------------------------------------

export const FrequencySchema = z.enum(["never", "rare", "normal"]).meta({ id: "Frequency" });
export type Frequency = z.infer<typeof FrequencySchema>;

export const EmojiPolicySchema = z.enum(["none", "rare", "normal"]).meta({ id: "EmojiPolicy" });
export type EmojiPolicy = z.infer<typeof EmojiPolicySchema>;

export const VoiceProfileExtractionSchema = z
  .object({
    schemaVersion: SchemaVersionSchema,
    sampleCount: z.int().min(1),
    rhythm: Text,
    openers: z.array(Text),
    closers: z.array(Text),
    punctuation: z.object({
      emDash: FrequencySchema,
      ellipsis: FrequencySchema,
      colon: FrequencySchema,
      parentheses: FrequencySchema,
    }),
    casing: z.enum(["standard", "lowercase-starts"]),
    vocabularyUsed: z.array(Text),
    emojiPolicy: EmojiPolicySchema,
    formatting: Text,
    signatureSamples: z
      .array(Text)
      .min(2)
      .max(4)
      .describe("2–4 literal excerpts from the samples."),
    confidence: Unit.describe("0–1; with 3 samples, at most 0.6."),
    notesForAuthor: z
      .array(Text)
      .describe("What the samples do not show and the interview must cover."),
  })
  .meta({ id: "VoiceProfileExtraction" });
export type VoiceProfileExtraction = z.infer<typeof VoiceProfileExtractionSchema>;

// ---------------------------------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------------------------------

export interface StructuredOutputDefinition<T extends z.ZodType = z.ZodType> {
  /** JSON Schema `name` sent to OpenAI and `$id` suffix. */
  name: string;
  /** Prompt that produces it. */
  promptId: PromptId;
  schemaVersion: typeof STRUCTURED_OUTPUT_SCHEMA_VERSION;
  schema: T;
}

function define<T extends z.ZodType>(
  name: string,
  promptId: PromptId,
  schema: T,
): StructuredOutputDefinition<T> {
  return { name, promptId, schemaVersion: STRUCTURED_OUTPUT_SCHEMA_VERSION, schema };
}

export const STRUCTURED_OUTPUTS = {
  opportunityClassification: define(
    "OpportunityClassification",
    "opportunity-classify",
    OpportunityClassificationSchema,
  ),
  editorialBrief: define("EditorialBrief", "brief", EditorialBriefSchema),
  postDraft: define("PostDraft", "draft-writer", PostDraftSchema),
  mediaSuggestion: define("MediaSuggestion", "media", MediaSuggestionOutputSchema),
  qualityEvaluation: define("QualityEvaluation", "quality", QualityEvaluationSchema),
  voiceProfileExtraction: define(
    "VoiceProfileExtraction",
    "voice-extract",
    VoiceProfileExtractionSchema,
  ),
  cvExtraction: define("CvExtraction", "cv-extract", CvExtractionOutputSchema),
  jobExtraction: define("JobExtraction", "job-extract", JobExtractionOutputSchema),
  cvTailoring: define("CvTailoring", "cv-tailor", CvTailoringOutputSchema),
  cvHumanization: define("CvHumanization", "cv-humanize", CvHumanizationOutputSchema),
} as const;
export type StructuredOutputKey = keyof typeof STRUCTURED_OUTPUTS;

/** Strict JSON Schema ready for `text.format` (`{ type: "json_schema", ...this }`). */
export function structuredOutputJsonSchema(key: StructuredOutputKey): StructuredOutputSchema {
  const definition = STRUCTURED_OUTPUTS[key];
  return toStructuredOutputSchema(definition.name, definition.schema);
}
