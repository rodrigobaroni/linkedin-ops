/**
 * Career module: structured CV, extracted job posting, tailored CV and match report
 * (docs/superpowers/specs/2026-10-22-cv-tailoring-design.md §4–§6).
 *
 * Two layers:
 * - **Content** schemas (`CvStructured`, `JobPostingExtracted`, `TailoredCvContent`, `MatchReport`) are what
 *   persistence (`cv_bases.content`, `job_postings.extracted`, `tailored_cvs.content|match_report`), the API
 *   and the web exchange.
 * - **Model output** schemas (`CvExtractionOutput`, `JobExtractionOutput`, `CvTailoringOutput`,
 *   `CvHumanizationOutput`) wrap content with model metadata (`schemaVersion`, injection flags) and are
 *   registered in `STRUCTURED_OUTPUTS`. The engine maps output → content.
 *
 * Strict-mode rules as in `engine/structured-outputs.ts`: closed objects, every property required, optionals as
 * `.nullable()`; limits strict mode may not enforce are validated by Zod after parse.
 *
 * The match score is **computed by the engine** from requirement coverage of the base CV (before anything is
 * added); the model never returns a score. Provenance (`original | rewritten | added`) is mandatory on every
 * tailored text segment and is shown in review only, never in the PDF (spec §8, decision D4).
 */
import { z } from "zod";

export const CAREER_SCHEMA_VERSION = "1.0" as const;
const SchemaVersionSchema = z.literal(CAREER_SCHEMA_VERSION);

const MAX_ITEMS = 50;
const ShortText = z.string().min(1).max(200);
const LongText = z.string().min(1).max(2000);
const NullableShortText = ShortText.nullable();

/** Stable item id inside one CV or posting, e.g. `exp-1`, `req-3`, `summary`. Unique per document. */
export const CareerItemIdSchema = z
  .string()
  .regex(/^[a-z]+(-\d{1,3})?$/)
  .describe("Stable item id, e.g. exp-1, edu-2, skill-3, req-4, summary.")
  .meta({ id: "CareerItemId" });
export type CareerItemId = z.infer<typeof CareerItemIdSchema>;

/** Language of a CV or posting (BCP 47 subset: `pt-BR`, `en`, `es`). Not limited to the editorial languages. */
export const CareerLanguageSchema = z
  .string()
  .regex(/^[a-z]{2,3}(-[A-Z]{2})?$/)
  .describe("BCP 47 language tag, e.g. pt-BR, en, es.")
  .meta({ id: "CareerLanguage" });
export type CareerLanguage = z.infer<typeof CareerLanguageSchema>;

/** `YYYY` or `YYYY-MM`, as printed on the CV. */
export const CvDateSchema = z
  .string()
  .regex(/^\d{4}(-(0[1-9]|1[0-2]))?$/)
  .nullable()
  .describe("YYYY or YYYY-MM; null when the CV does not say.")
  .meta({ id: "CvDate" });
export type CvDate = z.infer<typeof CvDateSchema>;

const InjectionFlags = {
  injectionSuspected: z
    .boolean()
    .describe("The document contains text that tries to instruct the model."),
  injectionEvidence: z.string().max(500).nullable(),
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
// Structured CV (cv.extract → reviewed and confirmed by Rodrigo → base CV)
// ---------------------------------------------------------------------------------------------------

export const CvContactSchema = z
  .strictObject({
    fullName: ShortText,
    headline: NullableShortText.describe("Professional headline as written on the CV."),
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
    startDate: CvDateSchema,
    endDate: CvDateSchema,
    current: z.boolean(),
    description: LongText.nullable(),
    bullets: z.array(LongText).max(MAX_ITEMS),
  })
  .meta({ id: "CvExperience" });
export type CvExperience = z.infer<typeof CvExperienceSchema>;

export const CvEducationSchema = z
  .strictObject({
    id: CareerItemIdSchema,
    institution: ShortText,
    degree: NullableShortText,
    field: NullableShortText,
    startDate: CvDateSchema,
    endDate: CvDateSchema,
  })
  .meta({ id: "CvEducation" });
export type CvEducation = z.infer<typeof CvEducationSchema>;

export const CvSkillCategorySchema = z
  .enum(["technical", "behavioral", "other"])
  .meta({ id: "CvSkillCategory" });
export type CvSkillCategory = z.infer<typeof CvSkillCategorySchema>;

export const CvSkillSchema = z
  .strictObject({ id: CareerItemIdSchema, name: ShortText, category: CvSkillCategorySchema })
  .meta({ id: "CvSkill" });
export type CvSkill = z.infer<typeof CvSkillSchema>;

export const CvLanguageSkillSchema = z
  .strictObject({
    id: CareerItemIdSchema,
    language: ShortText.describe("Language name as written, e.g. Inglês."),
    proficiency: NullableShortText.describe("As written, e.g. fluente, C1."),
  })
  .meta({ id: "CvLanguageSkill" });
export type CvLanguageSkill = z.infer<typeof CvLanguageSkillSchema>;

export const CvCertificationSchema = z
  .strictObject({
    id: CareerItemIdSchema,
    name: ShortText,
    issuer: NullableShortText,
    year: z
      .string()
      .regex(/^\d{4}$/)
      .nullable(),
  })
  .meta({ id: "CvCertification" });
export type CvCertification = z.infer<typeof CvCertificationSchema>;

/** Base CV content. Persisted in `cv_bases.content`; body of `POST /career/cv/confirm`. */
export const CvStructuredSchema = z
  .strictObject({
    language: CareerLanguageSchema,
    contact: CvContactSchema,
    summary: z.string().min(1).max(3000).nullable(),
    experiences: z.array(CvExperienceSchema).max(MAX_ITEMS),
    education: z.array(CvEducationSchema).max(MAX_ITEMS),
    skills: z.array(CvSkillSchema).max(100),
    languages: z.array(CvLanguageSkillSchema).max(20),
    certifications: z.array(CvCertificationSchema).max(MAX_ITEMS),
  })
  .superRefine((cv, ctx) => {
    const ids = [
      ...cv.experiences.map((item) => item.id),
      ...cv.education.map((item) => item.id),
      ...cv.skills.map((item) => item.id),
      ...cv.languages.map((item) => item.id),
      ...cv.certifications.map((item) => item.id),
    ];
    addUniqueIdIssues(ids, ctx, ["ids"]);
    if (ids.includes("summary")) {
      ctx.addIssue({ code: "custom", path: ["ids"], message: '"summary" is a reserved item id' });
    }
  })
  .meta({ id: "CvStructured" });
export type CvStructured = z.infer<typeof CvStructuredSchema>;

/** Model output of `cv-extract`. `warnings` lists what could not be read (never CV content). */
export const CvExtractionOutputSchema = z
  .strictObject({
    schemaVersion: SchemaVersionSchema,
    cv: CvStructuredSchema,
    warnings: z.array(ShortText).max(20).describe("Sections that could not be read reliably."),
    ...InjectionFlags,
  })
  .meta({ id: "CvExtractionOutput" });
export type CvExtractionOutput = z.infer<typeof CvExtractionOutputSchema>;

// ---------------------------------------------------------------------------------------------------
// Extracted job posting (job.extract)
// ---------------------------------------------------------------------------------------------------

export const JobSenioritySchema = z
  .enum([
    "intern",
    "junior",
    "mid",
    "senior",
    "staff",
    "principal",
    "lead",
    "manager",
    "director",
    "executive",
    "unspecified",
  ])
  .meta({ id: "JobSeniority" });
export type JobSeniority = z.infer<typeof JobSenioritySchema>;

export const JobWorkModelSchema = z
  .enum(["onsite", "hybrid", "remote", "unspecified"])
  .meta({ id: "JobWorkModel" });
export type JobWorkModel = z.infer<typeof JobWorkModelSchema>;

/** `required` = obrigatório; `preferred` = desejável. */
export const JobRequirementKindSchema = z
  .enum(["required", "preferred"])
  .meta({ id: "JobRequirementKind" });
export type JobRequirementKind = z.infer<typeof JobRequirementKindSchema>;

export const JobRequirementCategorySchema = z
  .enum(["technical", "behavioral", "experience", "education", "language", "other"])
  .meta({ id: "JobRequirementCategory" });
export type JobRequirementCategory = z.infer<typeof JobRequirementCategorySchema>;

export const JobRequirementSchema = z
  .strictObject({
    id: CareerItemIdSchema.describe("req-1, req-2, ..."),
    text: z.string().min(1).max(500).describe("The requirement as stated by the posting."),
    kind: JobRequirementKindSchema,
    category: JobRequirementCategorySchema,
  })
  .meta({ id: "JobRequirement" });
export type JobRequirement = z.infer<typeof JobRequirementSchema>;

/** Extracted posting. Persisted in `job_postings.extracted`. No names of recruiters or other people. */
export const JobPostingExtractedSchema = z
  .strictObject({
    title: ShortText,
    company: NullableShortText,
    location: NullableShortText,
    workModel: JobWorkModelSchema,
    seniority: JobSenioritySchema,
    language: CareerLanguageSchema.describe("Language the posting is written in."),
    summary: LongText.nullable().describe("What the role does, in 2–3 sentences."),
    requirements: z.array(JobRequirementSchema).min(1).max(60),
  })
  .superRefine((job, ctx) =>
    addUniqueIdIssues(
      job.requirements.map((item) => item.id),
      ctx,
      ["requirements"],
    ),
  )
  .meta({ id: "JobPostingExtracted" });
export type JobPostingExtracted = z.infer<typeof JobPostingExtractedSchema>;

/** Model output of `job-extract`. `isJobPosting: false` ⇒ `job: null` (failure reason `not_a_job`). */
export const JobExtractionOutputSchema = z
  .strictObject({
    schemaVersion: SchemaVersionSchema,
    isJobPosting: z.boolean().describe("False when the page is not a single job posting."),
    job: JobPostingExtractedSchema.nullable(),
    ...InjectionFlags,
  })
  .superRefine((output, ctx) => {
    if (output.isJobPosting !== (output.job !== null)) {
      ctx.addIssue({
        code: "custom",
        path: ["job"],
        message: "job must be present exactly when isJobPosting is true",
      });
    }
  })
  .meta({ id: "JobExtractionOutput" });
export type JobExtractionOutput = z.infer<typeof JobExtractionOutputSchema>;

// ---------------------------------------------------------------------------------------------------
// Tailored CV (cv.tailor → cv.humanize)
// ---------------------------------------------------------------------------------------------------

/**
 * `original` = verbatim from the base CV (may be reordered); `rewritten` = same content reworded, translated or
 * re-emphasized (translation is never `original`); `added` = not in the base CV, D4 exception
 * (`docs/editorial/career-editorial-exception.md`).
 */
export const ProvenanceSchema = z
  .enum(["original", "rewritten", "added"])
  .meta({ id: "Provenance" });
export const Provenance = ProvenanceSchema.enum;
export type Provenance = z.infer<typeof ProvenanceSchema>;

/**
 * One tailored text segment. `sourceRefs` cite base CV item ids for `original`/`rewritten` and job requirement
 * ids for `added` (the requirement that motivated the addition). The engine checks the ids exist.
 */
export const ProvenancedTextSchema = z
  .strictObject({
    text: LongText,
    provenance: ProvenanceSchema,
    sourceRefs: z
      .array(CareerItemIdSchema)
      .min(1)
      .max(5)
      .describe(
        "original/rewritten: base CV item ids the text comes from; added: job requirement ids that motivated it.",
      ),
  })
  .meta({ id: "ProvenancedText" });
export type ProvenancedText = z.infer<typeof ProvenancedTextSchema>;

function addNotAddedIssue(
  segment: ProvenancedText | null,
  ctx: z.RefinementCtx,
  path: (string | number)[],
): void {
  if (segment?.provenance === "added") {
    ctx.addIssue({ code: "custom", path, message: "This field cannot be added content" });
  }
}

/**
 * Experiences, education and certifications reference a base item (`baseId`): company, dates and
 * institution come from the base CV at render time, never from the model. Titles may be reworded or
 * translated but never invented.
 */
export const TailoredExperienceSchema = z
  .strictObject({
    baseId: CareerItemIdSchema,
    title: ProvenancedTextSchema,
    bullets: z.array(ProvenancedTextSchema).max(MAX_ITEMS),
  })
  .superRefine((item, ctx) => addNotAddedIssue(item.title, ctx, ["title"]))
  .meta({ id: "TailoredExperience" });
export type TailoredExperience = z.infer<typeof TailoredExperienceSchema>;

export const TailoredEducationSchema = z
  .strictObject({
    baseId: CareerItemIdSchema,
    degree: ProvenancedTextSchema.nullable(),
    field: ProvenancedTextSchema.nullable(),
  })
  .superRefine((item, ctx) => {
    addNotAddedIssue(item.degree, ctx, ["degree"]);
    addNotAddedIssue(item.field, ctx, ["field"]);
  })
  .meta({ id: "TailoredEducation" });
export type TailoredEducation = z.infer<typeof TailoredEducationSchema>;

export const TailoredCertificationSchema = z
  .strictObject({ baseId: CareerItemIdSchema, name: ProvenancedTextSchema })
  .superRefine((item, ctx) => addNotAddedIssue(item.name, ctx, ["name"]))
  .meta({ id: "TailoredCertification" });
export type TailoredCertification = z.infer<typeof TailoredCertificationSchema>;

/**
 * Tailored CV in the posting's language, items ordered by relevance. Persisted in `tailored_cvs.content`.
 * Contact data is taken from the base CV at render time.
 */
export const TailoredCvContentSchema = z
  .strictObject({
    language: CareerLanguageSchema,
    headline: ProvenancedTextSchema.nullable(),
    summary: ProvenancedTextSchema.nullable(),
    experiences: z.array(TailoredExperienceSchema).max(MAX_ITEMS),
    education: z.array(TailoredEducationSchema).max(MAX_ITEMS),
    skills: z.array(ProvenancedTextSchema).max(100),
    /** Never `added`: a language with a declared level is not invented (D4 hard limit 1). */
    languages: z.array(ProvenancedTextSchema).max(20),
    certifications: z.array(TailoredCertificationSchema).max(MAX_ITEMS),
  })
  .superRefine((cv, ctx) => {
    cv.languages.forEach((segment, index) => addNotAddedIssue(segment, ctx, ["languages", index]));
    addUniqueIdIssues(
      cv.experiences.map((item) => item.baseId),
      ctx,
      ["experiences"],
    );
    addUniqueIdIssues(
      cv.education.map((item) => item.baseId),
      ctx,
      ["education"],
    );
    addUniqueIdIssues(
      cv.certifications.map((item) => item.baseId),
      ctx,
      ["certifications"],
    );
  })
  .meta({ id: "TailoredCvContent" });
export type TailoredCvContent = z.infer<typeof TailoredCvContentSchema>;

// ---------------------------------------------------------------------------------------------------
// Requirement coverage and match report
// ---------------------------------------------------------------------------------------------------

export const RequirementCoverageStatusSchema = z
  .enum(["met", "partial", "missing"])
  .meta({ id: "RequirementCoverageStatus" });
export type RequirementCoverageStatus = z.infer<typeof RequirementCoverageStatusSchema>;

export const CoverageEvidenceSchema = z
  .strictObject({
    ref: CareerItemIdSchema.describe("Base CV item id that covers the requirement."),
    quote: z.string().min(1).max(500).describe("Literal excerpt of the base CV."),
  })
  .meta({ id: "CoverageEvidence" });
export type CoverageEvidence = z.infer<typeof CoverageEvidenceSchema>;

/** Coverage of one requirement by the **base** CV (before anything is added). */
export const RequirementCoverageSchema = z
  .strictObject({
    requirementId: CareerItemIdSchema,
    status: RequirementCoverageStatusSchema,
    evidence: z.array(CoverageEvidenceSchema).max(5),
  })
  .superRefine((coverage, ctx) => {
    const hasEvidence = coverage.evidence.length > 0;
    if ((coverage.status === "missing") === hasEvidence) {
      ctx.addIssue({
        code: "custom",
        path: ["evidence"],
        message: "evidence must be empty exactly when status is missing",
      });
    }
  })
  .meta({ id: "RequirementCoverage" });
export type RequirementCoverage = z.infer<typeof RequirementCoverageSchema>;

/** Model output of `cv-tailor`: coverage assessed on the base CV, plus the tailored CV. No score. */
export const CvTailoringOutputSchema = z
  .strictObject({
    schemaVersion: SchemaVersionSchema,
    coverage: z.array(RequirementCoverageSchema).max(60),
    cv: TailoredCvContentSchema,
    ...InjectionFlags,
  })
  .superRefine((output, ctx) =>
    addUniqueIdIssues(
      output.coverage.map((item) => item.requirementId),
      ctx,
      ["coverage"],
    ),
  )
  .meta({ id: "CvTailoringOutput" });
export type CvTailoringOutput = z.infer<typeof CvTailoringOutputSchema>;

export const HumanizerChangeSchema = z
  .strictObject({
    ruleId: ShortText,
    before: LongText,
    after: LongText,
  })
  .meta({ id: "HumanizerChange" });
export type HumanizerChange = z.infer<typeof HumanizerChangeSchema>;

/** Model output of `cv-humanize`: same structure and provenance, wording only. */
export const CvHumanizationOutputSchema = z
  .strictObject({
    schemaVersion: SchemaVersionSchema,
    cv: TailoredCvContentSchema,
    changes: z.array(HumanizerChangeSchema).max(200),
    factsChanged: z.boolean().describe("Must be false; true rejects the pass."),
    ...InjectionFlags,
  })
  .superRefine((output, ctx) => {
    if (output.factsChanged) {
      ctx.addIssue({
        code: "custom",
        path: ["factsChanged"],
        message: "Humanization must not change facts",
      });
    }
  })
  .meta({ id: "CvHumanizationOutput" });
export type CvHumanizationOutput = z.infer<typeof CvHumanizationOutputSchema>;

export const MatchedRequirementSchema = z
  .strictObject({
    requirementId: CareerItemIdSchema,
    text: z.string().min(1).max(500),
    kind: JobRequirementKindSchema,
    category: JobRequirementCategorySchema,
    status: RequirementCoverageStatusSchema,
    evidence: z.array(CoverageEvidenceSchema).max(5),
  })
  .meta({ id: "MatchedRequirement" });
export type MatchedRequirement = z.infer<typeof MatchedRequirementSchema>;

export const AddedContentSectionSchema = z
  .enum(["headline", "summary", "experience", "skills"])
  .meta({ id: "AddedContentSection" });
export type AddedContentSection = z.infer<typeof AddedContentSectionSchema>;

export const AddedContentSchema = z
  .strictObject({
    section: AddedContentSectionSchema,
    /** Base experience the bullet was added to; null outside `experience`. */
    baseId: CareerItemIdSchema.nullable(),
    text: LongText,
    /** Job requirements that motivated the addition. */
    requirementIds: z.array(CareerItemIdSchema).min(1).max(5),
  })
  .meta({ id: "AddedContent" });
export type AddedContent = z.infer<typeof AddedContentSchema>;

export const HumanizerCheckSchema = z
  .strictObject({
    passed: z.boolean(),
    /** Regenerations performed (spec §5: at most 2). */
    regenerations: z.int().min(0).max(2),
    /** Rule ids of the deterministic checker still failing when delivered. */
    failedRuleIds: z.array(ShortText).max(50),
    rulesVersion: ShortText,
  })
  .meta({ id: "HumanizerCheck" });
export type HumanizerCheck = z.infer<typeof HumanizerCheckSchema>;

/**
 * Match report. Persisted in `tailored_cvs.match_report`. `baseScore` (0–100) is computed by the engine
 * (`scoringVersion`) from `requirements` — coverage of the base CV before anything is added. `added` lists
 * everything the tailored CV contains that is not in the base CV, so Rodrigo can prepare (spec §5.6).
 */
export const MatchReportSchema = z
  .strictObject({
    schemaVersion: SchemaVersionSchema,
    scoringVersion: ShortText,
    baseScore: z.int().min(0).max(100),
    requirements: z.array(MatchedRequirementSchema).max(60),
    added: z.array(AddedContentSchema).max(200),
    humanizer: HumanizerCheckSchema,
    injectionSuspected: z.boolean(),
  })
  .meta({ id: "MatchReport" });
export type MatchReport = z.infer<typeof MatchReportSchema>;
