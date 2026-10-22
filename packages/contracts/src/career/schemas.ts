/**
 * Career module: structured CV, extracted job posting, tailored CV and match report
 * (docs/superpowers/specs/2026-10-22-cv-tailoring-design.md §4–§6; prompts and field names from
 * docs/editorial/career-prompts.md v1.0.0, owner Pena).
 *
 * Two layers:
 * - **Model outputs** (`CvExtractionOutput`, `JobExtractionOutput`, `CvTailoringOutput`,
 *   `CvHumanizationOutput`) keep Pena's field names and are registered in `STRUCTURED_OUTPUTS`.
 * - **Content** (`CvStructured`, `JobPostingExtracted`, `TailoredCvContent`, `MatchReport`) is what persistence
 *   (`cv_bases.content`, `job_postings.extracted`, `tailored_cvs.content|match_report`), the API and the web
 *   exchange. The engine maps output → content after its code checks (ids normalized, evidence verified,
 *   provenance enforced).
 *
 * Strict-mode rules as in `engine/structured-outputs.ts`: closed objects, every property required, optionals as
 * `.nullable()`; limits strict mode may not enforce are validated by Zod after parse. All objects are strict
 * (unknown keys fail, threat model TM-06).
 *
 * The match score is **computed by the engine** from `matchAssessment` on the base CV (before anything is
 * added); the model never returns a score. Provenance (`original | rewritten | added`, shown in the UI as
 * original / reescrito / acrescentado) is mandatory on every tailored segment and appears in review only, never
 * in the PDF (spec §8, decision D4, docs/editorial/career-editorial-exception.md).
 */
import { z } from "zod";

export const CAREER_SCHEMA_VERSION = "1.0" as const;
const SchemaVersionSchema = z.literal(CAREER_SCHEMA_VERSION);

const MAX_ITEMS = 50;
const ShortText = z.string().min(1).max(200);
const LongText = z.string().min(1).max(2000);
const NullableShortText = ShortText.nullable();
const Note = z.string().min(1).max(240);

/** Stable item id inside one CV, posting or tailored CV, e.g. `exp-1`, `exp-1-b-2`, `req-3`, `seg-12`. */
export const CareerItemIdSchema = z
  .string()
  .max(40)
  .regex(/^[a-z]+(?:-[a-z0-9]+)*$/)
  .describe("Stable item id, e.g. exp-1, exp-1-b-2, edu-1, req-3, seg-4.")
  .meta({ id: "CareerItemId" });
export type CareerItemId = z.infer<typeof CareerItemIdSchema>;

/** Languages the module writes and lints. Anything else is `other` (see the engine's `FALLBACK_LANGUAGE`). */
export const CareerLanguageSchema = z.enum(["pt-BR", "en"]).meta({ id: "CareerLanguage" });
export const CareerLanguage = CareerLanguageSchema.enum;
export type CareerLanguage = z.infer<typeof CareerLanguageSchema>;

export const DetectedLanguageSchema = z
  .enum(["pt-BR", "en", "other"])
  .meta({ id: "DetectedLanguage" });
export type DetectedLanguage = z.infer<typeof DetectedLanguageSchema>;

/** BCP 47 tag as detected (`es`, `de-DE`), kept for the report when the language is `other`. */
export const LanguageTagSchema = z
  .string()
  .regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/)
  .meta({ id: "LanguageTag" });

/** As printed on the CV: `YYYY-MM` when unambiguous, otherwise the literal text (with a parse warning). */
const CvDate = z.string().min(1).max(40);

const InjectionFlags = {
  injectionSuspected: z
    .boolean()
    .describe("The data contains text that tries to instruct the model."),
  injectionEvidence: z.string().max(200).nullable(),
};

function addUniqueIdIssues(
  ids: readonly string[],
  ctx: z.RefinementCtx,
  path: (string | number)[],
): void {
  const seen = new Set<string>();
  ids.forEach((id, index) => {
    if (seen.has(id)) {
      ctx.addIssue({
        code: "custom",
        path: [...path, index],
        message: `Duplicate item id "${id}"`,
      });
    }
    seen.add(id);
  });
}

// ---------------------------------------------------------------------------------------------------
// Structured CV (cv-extract → reviewed and confirmed by Rodrigo → base CV)
// ---------------------------------------------------------------------------------------------------

export const CvTextItemSchema = z
  .strictObject({ id: CareerItemIdSchema, text: LongText })
  .meta({ id: "CvTextItem" });
export type CvTextItem = z.infer<typeof CvTextItemSchema>;

export const CvContactSchema = z
  .strictObject({
    name: NullableShortText,
    email: NullableShortText,
    phone: NullableShortText,
    location: NullableShortText,
    links: z.array(ShortText).max(10).describe("Public profile/portfolio URLs as written."),
  })
  .meta({ id: "CvContact" });
export type CvContact = z.infer<typeof CvContactSchema>;

export const CvExperienceSchema = z
  .strictObject({
    id: CareerItemIdSchema,
    company: ShortText,
    title: ShortText,
    location: NullableShortText,
    startDate: CvDate.nullable(),
    endDate: CvDate.nullable(),
    isCurrent: z.boolean(),
    bullets: z.array(CvTextItemSchema).max(MAX_ITEMS),
    skills: z.array(CvTextItemSchema).max(MAX_ITEMS),
  })
  .meta({ id: "CvExperience" });
export type CvExperience = z.infer<typeof CvExperienceSchema>;

export const CvEducationSchema = z
  .strictObject({
    id: CareerItemIdSchema,
    institution: ShortText,
    degree: NullableShortText,
    field: NullableShortText,
    startDate: CvDate.nullable(),
    endDate: CvDate.nullable(),
  })
  .meta({ id: "CvEducation" });
export type CvEducation = z.infer<typeof CvEducationSchema>;

export const CvCertificationSchema = z
  .strictObject({
    id: CareerItemIdSchema,
    name: ShortText,
    issuer: NullableShortText,
    date: CvDate.nullable(),
  })
  .meta({ id: "CvCertification" });
export type CvCertification = z.infer<typeof CvCertificationSchema>;

export const CvSkillsSchema = z
  .strictObject({
    technical: z.array(CvTextItemSchema).max(100),
    behavioral: z.array(CvTextItemSchema).max(100),
  })
  .meta({ id: "CvSkills" });
export type CvSkills = z.infer<typeof CvSkillsSchema>;

export const CvLanguageSkillSchema = z
  .strictObject({
    id: CareerItemIdSchema,
    language: ShortText.describe("As written, e.g. Inglês."),
    level: NullableShortText.describe("As written, e.g. fluente, C1."),
  })
  .meta({ id: "CvLanguageSkill" });
export type CvLanguageSkill = z.infer<typeof CvLanguageSkillSchema>;

export const CvOtherSectionSchema = z
  .strictObject({ id: CareerItemIdSchema, heading: ShortText, text: z.string().min(1).max(5000) })
  .meta({ id: "CvOtherSection" });
export type CvOtherSection = z.infer<typeof CvOtherSectionSchema>;

const cvShape = {
  language: DetectedLanguageSchema,
  contact: CvContactSchema,
  summary: CvTextItemSchema.nullable(),
  experiences: z.array(CvExperienceSchema).max(MAX_ITEMS),
  education: z.array(CvEducationSchema).max(MAX_ITEMS),
  certifications: z.array(CvCertificationSchema).max(MAX_ITEMS),
  skills: CvSkillsSchema,
  languages: z.array(CvLanguageSkillSchema).max(20),
  other: z
    .array(CvOtherSectionSchema)
    .max(20)
    .describe("Unrecognized sections; nothing is dropped."),
};

type CvSections = { [K in keyof typeof cvShape]: z.infer<(typeof cvShape)[K]> };

/** Every item id of a structured CV, in document order. */
export function cvItemIds(cv: CvSections): string[] {
  return [
    ...(cv.summary ? [cv.summary.id] : []),
    ...cv.experiences.flatMap((item) => [
      item.id,
      ...item.bullets.map((bullet) => bullet.id),
      ...item.skills.map((skill) => skill.id),
    ]),
    ...cv.education.map((item) => item.id),
    ...cv.certifications.map((item) => item.id),
    ...cv.skills.technical.map((item) => item.id),
    ...cv.skills.behavioral.map((item) => item.id),
    ...cv.languages.map((item) => item.id),
    ...cv.other.map((item) => item.id),
  ];
}

/** Base CV content. Persisted in `cv_bases.content`; body of `POST /career/cv/confirm`. Ids unique. */
export const CvStructuredSchema = z
  .strictObject(cvShape)
  .superRefine((cv, ctx) => addUniqueIdIssues(cvItemIds(cv), ctx, ["ids"]))
  .meta({ id: "CvStructured" });
export type CvStructured = z.infer<typeof CvStructuredSchema>;

export const ParseWarningSchema = z
  .strictObject({ field: ShortText, message: ShortText })
  .meta({ id: "ParseWarning" });
export type ParseWarning = z.infer<typeof ParseWarningSchema>;

/** Model output of `cv-extract`. Ids are normalized by the engine afterwards. */
export const CvExtractionOutputSchema = z
  .strictObject({
    schemaVersion: SchemaVersionSchema,
    ...InjectionFlags,
    ...cvShape,
    parseWarnings: z.array(ParseWarningSchema).max(50),
  })
  .meta({ id: "CvExtractionOutput" });
export type CvExtractionOutput = z.infer<typeof CvExtractionOutputSchema>;

// ---------------------------------------------------------------------------------------------------
// Extracted job posting (job-extract)
// ---------------------------------------------------------------------------------------------------

export const JobWorkModeSchema = z.enum(["onsite", "hybrid", "remote"]).meta({ id: "JobWorkMode" });
export type JobWorkMode = z.infer<typeof JobWorkModeSchema>;

/** `mandatory` = obrigatório; `desirable` = desejável/diferencial. */
export const JobRequirementKindSchema = z
  .enum(["mandatory", "desirable"])
  .meta({ id: "JobRequirementKind" });
export type JobRequirementKind = z.infer<typeof JobRequirementKindSchema>;

export const JobRequirementCategorySchema = z
  .enum([
    "technical",
    "behavioral",
    "education",
    "certification",
    "language",
    "experience",
    "other",
  ])
  .meta({ id: "JobRequirementCategory" });
export type JobRequirementCategory = z.infer<typeof JobRequirementCategorySchema>;

export const JobRequirementSchema = z
  .strictObject({
    id: CareerItemIdSchema.describe("req-1, req-2, ..."),
    kind: JobRequirementKindSchema,
    category: JobRequirementCategorySchema,
    text: z.string().min(1).max(500).describe("Normalized requirement, in the posting's language."),
    evidence: z
      .string()
      .min(1)
      .max(200)
      .describe("Exact substring of the posting (checked by code)."),
  })
  .meta({ id: "JobRequirement" });
export type JobRequirement = z.infer<typeof JobRequirementSchema>;

const jobShape = {
  language: DetectedLanguageSchema,
  languageDetected: LanguageTagSchema,
  title: ShortText,
  company: NullableShortText,
  location: NullableShortText,
  workMode: JobWorkModeSchema.nullable(),
  seniority: NullableShortText,
  requirements: z.array(JobRequirementSchema).max(60),
  keywords: z.array(ShortText).max(60).describe("Technical terms cited literally."),
};

/**
 * Extracted posting. Persisted in `job_postings.extracted`. Requirements whose `evidence` is not found in the
 * posting text were dropped by the engine. No names of recruiters or other people.
 */
export const JobPostingExtractedSchema = z
  .strictObject({ ...jobShape, requirements: jobShape.requirements.min(1) })
  .superRefine((job, ctx) =>
    addUniqueIdIssues(
      job.requirements.map((item) => item.id),
      ctx,
      ["requirements"],
    ),
  )
  .meta({ id: "JobPostingExtracted" });
export type JobPostingExtracted = z.infer<typeof JobPostingExtractedSchema>;

/** Model output of `job-extract`. `isJobPosting: false` ⇒ failure reason `not_a_job`, other fields empty. */
export const JobExtractionOutputSchema = z
  .strictObject({
    schemaVersion: SchemaVersionSchema,
    ...InjectionFlags,
    isJobPosting: z.boolean(),
    notAJobReason: NullableShortText,
    ...jobShape,
    title: NullableShortText,
  })
  .superRefine((output, ctx) => {
    if (output.isJobPosting && output.title === null) {
      ctx.addIssue({ code: "custom", path: ["title"], message: "A job posting has a title" });
    }
    if (!output.isJobPosting && output.notAJobReason === null) {
      ctx.addIssue({
        code: "custom",
        path: ["notAJobReason"],
        message: "notAJobReason is required when isJobPosting is false",
      });
    }
  })
  .meta({ id: "JobExtractionOutput" });
export type JobExtractionOutput = z.infer<typeof JobExtractionOutputSchema>;

// ---------------------------------------------------------------------------------------------------
// Tailored CV (cv-tailor → cv-humanize)
// ---------------------------------------------------------------------------------------------------

/**
 * `original` = base text unchanged (reordering allowed); `rewritten` = same facts, new wording, emphasis or
 * language (translation is never `original`); `added` = not in the base CV, D4 exception.
 */
export const ProvenanceSchema = z
  .enum(["original", "rewritten", "added"])
  .meta({ id: "Provenance" });
export const Provenance = ProvenanceSchema.enum;
export type Provenance = z.infer<typeof ProvenanceSchema>;

/**
 * One tailored text segment. `original`/`rewritten` cite base CV item ids (`sourceCvItemIds`, non-empty);
 * `added` cites the requirement ids it targets (`targetRequirementIds`, non-empty) and explains itself in
 * `additionNote` (pt-BR). The engine checks the ids exist.
 */
export const CvSegmentSchema = z
  .strictObject({
    segmentId: CareerItemIdSchema.describe("seg-1, seg-2, ..."),
    text: LongText,
    provenance: ProvenanceSchema,
    sourceCvItemIds: z.array(CareerItemIdSchema).max(10),
    targetRequirementIds: z.array(CareerItemIdSchema).max(10),
    additionNote: Note.nullable(),
  })
  .superRefine((segment, ctx) => {
    const added = segment.provenance === "added";
    if (added && segment.targetRequirementIds.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["targetRequirementIds"],
        message: "An added segment targets at least one requirement",
      });
    }
    if (added && segment.additionNote === null) {
      ctx.addIssue({
        code: "custom",
        path: ["additionNote"],
        message: "An added segment explains the addition",
      });
    }
    if (added && segment.sourceCvItemIds.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["sourceCvItemIds"],
        message: "An added segment has no base CV source",
      });
    }
    if (!added && segment.sourceCvItemIds.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["sourceCvItemIds"],
        message: "An original or rewritten segment cites its base CV items",
      });
    }
  })
  .meta({ id: "CvSegment" });
export type CvSegment = z.infer<typeof CvSegmentSchema>;

export const CvSegmentListSchema = z
  .strictObject({ segments: z.array(CvSegmentSchema).max(MAX_ITEMS) })
  .meta({ id: "CvSegmentList" });
export type CvSegmentList = z.infer<typeof CvSegmentListSchema>;

const Order = z.int().min(1).max(100);

export const TailoringOutputCvSchema = z
  .strictObject({
    summary: CvSegmentListSchema,
    experiences: z
      .array(
        z.strictObject({
          cvExperienceId: CareerItemIdSchema,
          order: Order,
          bullets: CvSegmentListSchema,
          skills: CvSegmentListSchema,
        }),
      )
      .max(MAX_ITEMS),
    skills: z.strictObject({ technical: CvSegmentListSchema, behavioral: CvSegmentListSchema }),
    education: z
      .array(z.strictObject({ cvEducationId: CareerItemIdSchema, order: Order }))
      .max(MAX_ITEMS),
    certifications: z
      .array(z.strictObject({ cvCertificationId: CareerItemIdSchema, order: Order }))
      .max(MAX_ITEMS),
    languages: z.array(z.strictObject({ cvLanguageId: CareerItemIdSchema, order: Order })).max(20),
  })
  .meta({ id: "TailoringOutputCv" });
export type TailoringOutputCv = z.infer<typeof TailoringOutputCvSchema>;

export const RequirementStatusSchema = z
  .enum(["met", "partial", "missing"])
  .meta({ id: "RequirementStatus" });
export type RequirementStatus = z.infer<typeof RequirementStatusSchema>;

export const CvEvidenceSchema = z
  .strictObject({
    cvItemId: CareerItemIdSchema.describe("Base CV item that covers the requirement."),
    quote: z.string().min(1).max(500).describe("Exact substring of that base CV item."),
  })
  .meta({ id: "CvEvidence" });
export type CvEvidence = z.infer<typeof CvEvidenceSchema>;

export const RequirementAssessmentSchema = z
  .strictObject({
    requirementId: CareerItemIdSchema,
    status: RequirementStatusSchema,
    cvEvidence: z.array(CvEvidenceSchema).max(5),
    rationale: Note.describe("Up to 240 characters, Brazilian Portuguese."),
  })
  .meta({ id: "RequirementAssessment" });
export type RequirementAssessment = z.infer<typeof RequirementAssessmentSchema>;

/** Model output of `cv-tailor`: assessment of the BASE CV (no score), then the tailored CV. */
export const CvTailoringOutputSchema = z
  .strictObject({
    schemaVersion: SchemaVersionSchema,
    targetLanguage: CareerLanguageSchema,
    ...InjectionFlags,
    matchAssessment: z.strictObject({
      requirements: z.array(RequirementAssessmentSchema).max(60),
    }),
    tailoredCv: TailoringOutputCvSchema,
  })
  .meta({ id: "CvTailoringOutput" });
export type CvTailoringOutput = z.infer<typeof CvTailoringOutputSchema>;

export const HumanizedSegmentSchema = z
  .strictObject({
    segmentId: CareerItemIdSchema,
    text: LongText,
    changed: z.boolean(),
    changeReason: z.string().min(1).max(120).nullable(),
  })
  .meta({ id: "HumanizedSegment" });
export type HumanizedSegment = z.infer<typeof HumanizedSegmentSchema>;

/** Model output of `cv-humanize`: same segments, same order, wording only (provenance is not output). */
export const CvHumanizationOutputSchema = z
  .strictObject({
    schemaVersion: SchemaVersionSchema,
    ...InjectionFlags,
    segments: z.array(HumanizedSegmentSchema).max(500),
  })
  .meta({ id: "CvHumanizationOutput" });
export type CvHumanizationOutput = z.infer<typeof CvHumanizationOutputSchema>;

/**
 * Tailored CV after the engine's checks, in `language`, arrays in display order. Persisted in
 * `tailored_cvs.content`. Contact, company, title, dates, education, certifications and languages are copied
 * from the base CV by id at render time; the model only orders them.
 */
export const TailoredCvContentSchema = z
  .strictObject({
    language: CareerLanguageSchema,
    summary: CvSegmentListSchema,
    experiences: z
      .array(
        z.strictObject({
          cvExperienceId: CareerItemIdSchema,
          bullets: CvSegmentListSchema,
          skills: CvSegmentListSchema,
        }),
      )
      .max(MAX_ITEMS),
    skills: z.strictObject({ technical: CvSegmentListSchema, behavioral: CvSegmentListSchema }),
    educationIds: z.array(CareerItemIdSchema).max(MAX_ITEMS),
    certificationIds: z.array(CareerItemIdSchema).max(MAX_ITEMS),
    languageIds: z.array(CareerItemIdSchema).max(20),
  })
  .superRefine((cv, ctx) => {
    const segmentIds = [
      ...cv.summary.segments,
      ...cv.experiences.flatMap((item) => [...item.bullets.segments, ...item.skills.segments]),
      ...cv.skills.technical.segments,
      ...cv.skills.behavioral.segments,
    ].map((segment) => segment.segmentId);
    addUniqueIdIssues(segmentIds, ctx, ["segments"]);
    addUniqueIdIssues(
      cv.experiences.map((item) => item.cvExperienceId),
      ctx,
      ["experiences"],
    );
  })
  .meta({ id: "TailoredCvContent" });
export type TailoredCvContent = z.infer<typeof TailoredCvContentSchema>;

// ---------------------------------------------------------------------------------------------------
// Match report
// ---------------------------------------------------------------------------------------------------

export const MatchedRequirementSchema = z
  .strictObject({
    requirementId: CareerItemIdSchema,
    text: z.string().min(1).max(500),
    kind: JobRequirementKindSchema,
    category: JobRequirementCategorySchema,
    status: RequirementStatusSchema,
    cvEvidence: z.array(CvEvidenceSchema).max(5),
    rationale: Note,
    /** True when the model claimed met/partial but no quote matched the base CV (status forced to missing). */
    evidenceRejected: z.boolean(),
  })
  .meta({ id: "MatchedRequirement" });
export type MatchedRequirement = z.infer<typeof MatchedRequirementSchema>;

export const AddedSegmentSectionSchema = z
  .enum([
    "summary",
    "experience-bullets",
    "experience-skills",
    "skills-technical",
    "skills-behavioral",
  ])
  .meta({ id: "AddedSegmentSection" });
export type AddedSegmentSection = z.infer<typeof AddedSegmentSectionSchema>;

export const AddedSegmentSchema = z
  .strictObject({
    segmentId: CareerItemIdSchema,
    section: AddedSegmentSectionSchema,
    /** Base experience the segment belongs to; null outside experiences. */
    cvExperienceId: CareerItemIdSchema.nullable(),
    text: LongText,
    targetRequirementIds: z.array(CareerItemIdSchema).min(1).max(10),
    additionNote: Note,
  })
  .meta({ id: "AddedSegment" });
export type AddedSegment = z.infer<typeof AddedSegmentSchema>;

export const HumanizerCheckSchema = z
  .strictObject({
    rulesVersion: ShortText.describe("cv-banned-phrases@<version>"),
    passed: z.boolean(),
    /** Regenerations performed (spec §5: at most 2). */
    regenerations: z.int().min(0).max(2),
    /** Rule ids still failing when delivered (spec §9: delivered and flagged). */
    failedRuleIds: z.array(ShortText).max(100),
    /** Segments whose humanized text was discarded by the preservation check. */
    revertedSegmentIds: z.array(CareerItemIdSchema).max(500),
  })
  .meta({ id: "HumanizerCheck" });
export type HumanizerCheck = z.infer<typeof HumanizerCheckSchema>;

export const MatchReportWarningSchema = z
  .enum(["injection_suspected", "language_fallback", "job_echo"])
  .meta({ id: "MatchReportWarning" });
export type MatchReportWarning = z.infer<typeof MatchReportWarningSchema>;

/**
 * Match report. Persisted in `tailored_cvs.match_report`. `baseScore` (0–100) is computed by the engine
 * (`scoringVersion`) from `requirements` — the BASE CV before anything is added; additions never raise it.
 * `added` lists every added segment so Rodrigo can prepare (spec §5.6).
 */
export const MatchReportSchema = z
  .strictObject({
    schemaVersion: SchemaVersionSchema,
    scoringVersion: ShortText,
    baseScore: z.int().min(0).max(100),
    jobLanguage: LanguageTagSchema,
    cvLanguage: CareerLanguageSchema,
    requirements: z.array(MatchedRequirementSchema).max(60),
    added: z.array(AddedSegmentSchema).max(200),
    humanizer: HumanizerCheckSchema,
    warnings: z.array(MatchReportWarningSchema).max(10),
  })
  .meta({ id: "MatchReport" });
export type MatchReport = z.infer<typeof MatchReportSchema>;
