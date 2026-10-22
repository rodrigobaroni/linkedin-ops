/**
 * Response parsers for the Career prompts (ADR-0005 §2: `parse*Response → Result<T, EngineError>`) with the
 * post-processing of docs/editorial/career-prompts.md §1–§4. Schema failures and semantic failures both mean
 * "ask for a new generation" (spec §9: up to 2, then `falhou` with reason `ai`). Issues carry ids and rule names
 * only, never content.
 */
import {
  CvExtractionOutputSchema,
  CvHumanizationOutputSchema,
  CvStructuredSchema,
  CvTailoringOutputSchema,
  JobExtractionOutputSchema,
  JobPostingExtractedSchema,
  TailoredCvContentSchema,
  type CvSegment,
  type CvStructured,
  type JobPostingExtracted,
  type MatchedRequirement,
  type ParseWarning,
  type TailoredCvContent,
} from "@linkedin-ops/contracts";
import type { z } from "zod";
import { err, ok, type EngineError, type Result } from "../result.js";
import { sanitizeUntrustedText } from "../untrusted.js";
import { besideLexiconTerm, createEntityGuard, withoutLexiconTerms } from "./entities.js";
import { cvFullText, cvItemTexts, normalizeCvIds } from "./ids.js";
import type { TargetLanguage } from "./language.js";
import { lintText } from "./lint/checker.js";
import { JOB_TEXT_MAX_CHARS } from "./requests.js";
import { listSegments, mapSegments } from "./segments.js";
import {
  containsNormalized,
  entityTokens,
  normalizeForMatch,
  numericTokens,
  sameNumbers,
} from "./text.js";

export interface InjectionReport {
  injectionSuspected: boolean;
  /** Short excerpt quoted by the model; external content: store with the item, never log. */
  injectionEvidence: string | null;
}

function schemaError(error: z.ZodError): EngineError {
  return {
    code: "SCHEMA_INVALID",
    issues: error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.code}`),
  };
}

function semanticError(issues: string[]): EngineError {
  return { code: "SEMANTIC_INVALID", issues };
}

// ---------------------------------------------------------------------------------------------------
// cv-extract
// ---------------------------------------------------------------------------------------------------

export interface ParsedCvExtraction extends InjectionReport {
  /** Draft base CV with canonical ids; Rodrigo reviews and confirms it. */
  cv: CvStructured;
  parseWarnings: ParseWarning[];
  /** The model judged the text not to be a CV (`parseWarnings` `document: not_a_cv`). */
  notACv: boolean;
}

export function parseCvExtractResponse(raw: unknown): Result<ParsedCvExtraction, EngineError> {
  const parsed = CvExtractionOutputSchema.safeParse(raw);
  if (!parsed.success) return err(schemaError(parsed.error));
  const cv = CvStructuredSchema.safeParse(normalizeCvIds(parsed.data));
  if (!cv.success) return err(schemaError(cv.error));
  return ok({
    cv: cv.data,
    parseWarnings: parsed.data.parseWarnings,
    notACv: parsed.data.parseWarnings.some(
      (warning) => warning.field === "document" && warning.message === "not_a_cv",
    ),
    injectionSuspected: parsed.data.injectionSuspected,
    injectionEvidence: parsed.data.injectionEvidence,
  });
}

// ---------------------------------------------------------------------------------------------------
// job-extract
// ---------------------------------------------------------------------------------------------------

export type ParsedJobExtraction =
  | (InjectionReport & {
      kind: "job";
      job: JobPostingExtracted;
      /** Requirements dropped because their `evidence` is not in the posting (recorded as a metric). */
      droppedRequirementCount: number;
    })
  | (InjectionReport & { kind: "not_a_job"; reason: string });

/** `postingText` is the same raw text given to `buildJobExtractRequest` (sanitized the same way here). */
export function parseJobExtractResponse(
  raw: unknown,
  context: { postingText: string },
): Result<ParsedJobExtraction, EngineError> {
  const parsed = JobExtractionOutputSchema.safeParse(raw);
  if (!parsed.success) return err(schemaError(parsed.error));
  const output = parsed.data;
  const injection = {
    injectionSuspected: output.injectionSuspected,
    injectionEvidence: output.injectionEvidence,
  };
  if (!output.isJobPosting) {
    return ok({ kind: "not_a_job", reason: output.notAJobReason ?? "not_a_job", ...injection });
  }
  const posting = sanitizeUntrustedText(context.postingText, JOB_TEXT_MAX_CHARS).text;
  const requirements = output.requirements.filter((requirement) =>
    containsNormalized(posting, requirement.evidence),
  );
  if (requirements.length === 0) {
    return err(semanticError(["requirements: no requirement with verifiable evidence"]));
  }
  const job = JobPostingExtractedSchema.safeParse({
    language: output.language,
    languageDetected: output.languageDetected,
    title: output.title,
    company: output.company,
    location: output.location,
    workMode: output.workMode,
    seniority: output.seniority,
    requirements,
    keywords: output.keywords,
  });
  if (!job.success) return err(schemaError(job.error));
  return ok({
    kind: "job",
    job: job.data,
    droppedRequirementCount: output.requirements.length - requirements.length,
    ...injection,
  });
}

// ---------------------------------------------------------------------------------------------------
// cv-tailor
// ---------------------------------------------------------------------------------------------------

/**
 * D4 hard limits (career-editorial-exception.md §3, confirmed by Rodrigo on 2026-10-22, §9). Fixed rule:
 * employer, title, dates, education, certifications and languages are never generated (copied from the base CV
 * by id); added segments carry no number absent from the base CV and no credential; no added or rewritten
 * segment names an entity absent from the base CV (`entities.ts`).
 */
const CREDENTIAL_PATTERN =
  /(?<![\p{L}\p{N}])(?:certifica\p{L}*|certified|certificate\p{L}*|diploma\p{L}*|bacharel\p{L}*|bachelor\p{L}*|mestrado|mestre|master'?s|mba|ph\.?d|doutorado|doutor|licen[cç]a\p{L}*|licen[cs]e[ds]?|p[oó]s-gradua\p{L}*|foundation|practitioner|agilist|belt|associate|specialty|fundamentals|professional\s+(?:scrum|data\s+engineer|cloud\s+architect|machine\s+learning\s+engineer))(?![\p{L}\p{N}])/iu;

/** Certification exam codes (`AZ-900`, `DP-203`, `SAA-C03`; Pena review §6.4). Case-sensitive: codes are caps. */
const EXAM_CODE_PATTERN =
  /(?<![\p{L}\p{N}])(?:AZ|DP|AI|PL|SC|MS|MB|SAA|SAP|DVA|SOA|CLF|DEA|MLS|DOP|ANS)-[A-Z]?\d{2,3}(?![\p{L}\p{N}])/u;

/**
 * An added credential (D4 hard limit 1): a credential word, an exam code, or a certification level beside a
 * lexicon term (`Kubernetes Expert`, `Professional Python`) — `expert` and `professional` alone are common words.
 */
function namesCredential(text: string): boolean {
  return (
    CREDENTIAL_PATTERN.test(text) ||
    EXAM_CODE_PATTERN.test(text) ||
    besideLexiconTerm(text, "expert", false) ||
    besideLexiconTerm(text, "professional", true)
  );
}

export interface ParsedCvTailoring extends InjectionReport {
  /** Tailored CV in display order, provenance enforced. */
  cv: TailoredCvContent;
  /** Assessment of the BASE CV after evidence verification, joined with the posting's requirements. */
  requirements: MatchedRequirement[];
  /** `original` segments whose text differs from the source and were promoted to `rewritten`. */
  promotedSegmentIds: string[];
}

export function parseCvTailorResponse(
  raw: unknown,
  context: { base: CvStructured; job: JobPostingExtracted; target: TargetLanguage },
): Result<ParsedCvTailoring, EngineError> {
  const parsed = CvTailoringOutputSchema.safeParse(raw);
  if (!parsed.success) return err(schemaError(parsed.error));
  const output = parsed.data;
  const { base, job } = context;
  const issues: string[] = [];
  const itemTexts = cvItemTexts(base);
  const requirementIds = new Set(job.requirements.map((requirement) => requirement.id));

  if (output.targetLanguage !== context.target.language) {
    issues.push(`targetLanguage: expected ${context.target.language}`);
  }

  // Step 1 — assessment of the base CV, evidence verified (post-processing 2).
  const assessed = new Map(
    output.matchAssessment.requirements.map((item) => [item.requirementId, item]),
  );
  if (assessed.size !== output.matchAssessment.requirements.length) {
    issues.push("matchAssessment: duplicate requirementId");
  }
  for (const id of assessed.keys()) {
    if (!requirementIds.has(id)) issues.push(`matchAssessment: unknown requirement ${id}`);
  }
  const requirements: MatchedRequirement[] = [];
  for (const requirement of job.requirements) {
    const assessment = assessed.get(requirement.id);
    if (!assessment) {
      issues.push(`matchAssessment: requirement ${requirement.id} not assessed`);
      continue;
    }
    const evidence =
      assessment.status === "missing"
        ? []
        : assessment.cvEvidence.filter((item) => {
            const source = itemTexts.get(item.cvItemId);
            return source !== undefined && containsNormalized(source, item.quote);
          });
    const evidenceRejected = assessment.status !== "missing" && evidence.length === 0;
    requirements.push({
      requirementId: requirement.id,
      text: requirement.text,
      kind: requirement.kind,
      category: requirement.category,
      status: evidenceRejected ? "missing" : assessment.status,
      cvEvidence: evidence,
      rationale: assessment.rationale,
      evidenceRejected,
    });
  }

  // Step 2 — structure: nothing dropped, nothing invented (D4 hard limits 1 and 2).
  const tailored = output.tailoredCv;
  const sameIds = (label: string, expected: string[], actual: string[]) => {
    const missing = expected.filter((id) => !actual.includes(id));
    const extra = actual.filter((id) => !expected.includes(id));
    if (missing.length > 0) issues.push(`${label}: missing ${missing.join(",")}`);
    if (extra.length > 0) issues.push(`${label}: unknown ${extra.join(",")}`);
    if (new Set(actual).size !== actual.length) issues.push(`${label}: duplicate id`);
  };
  sameIds(
    "experiences",
    base.experiences.map((item) => item.id),
    tailored.experiences.map((item) => item.cvExperienceId),
  );
  sameIds(
    "education",
    base.education.map((item) => item.id),
    tailored.education.map((item) => item.cvEducationId),
  );
  sameIds(
    "certifications",
    base.certifications.map((item) => item.id),
    tailored.certifications.map((item) => item.cvCertificationId),
  );
  sameIds(
    "languages",
    base.languages.map((item) => item.id),
    tailored.languages.map((item) => item.cvLanguageId),
  );

  const byOrder = <T extends { order: number }>(items: readonly T[]) =>
    [...items].sort((a, b) => a.order - b.order);
  const draft = TailoredCvContentSchema.safeParse({
    language: context.target.language,
    summary: tailored.summary,
    experiences: byOrder(tailored.experiences).map(({ cvExperienceId, bullets, skills }) => ({
      cvExperienceId,
      bullets,
      skills,
    })),
    skills: tailored.skills,
    educationIds: byOrder(tailored.education).map((item) => item.cvEducationId),
    certificationIds: byOrder(tailored.certifications).map((item) => item.cvCertificationId),
    languageIds: byOrder(tailored.languages).map((item) => item.cvLanguageId),
  });
  if (!draft.success) return err(schemaError(draft.error));

  // Provenance (post-processing 3) and hard limits on additions (post-processing 4).
  const baseNumbers = new Set(numericTokens(cvFullText(base)));
  const entityGuard = createEntityGuard(base, job);
  const promotedSegmentIds: string[] = [];
  for (const { segment } of listSegments(draft.data)) {
    for (const id of segment.targetRequirementIds) {
      if (!requirementIds.has(id)) issues.push(`${segment.segmentId}: unknown requirement ${id}`);
    }
    // D4 hard limits 1, 2 and 4: no employer, title, date, institution, certification, client, project or
    // other proper noun absent from the base CV, in added and rewritten text alike.
    if (entityGuard.newEntities(segment.text, segment.targetRequirementIds).length > 0) {
      issues.push(`${segment.segmentId}: hard limit, new entity`);
    }
    if (segment.provenance === "added") {
      if (
        numericTokens(withoutLexiconTerms(segment.text)).some((token) => !baseNumbers.has(token))
      ) {
        issues.push(`${segment.segmentId}: hard limit, added number`);
      }
      if (namesCredential(segment.text)) {
        issues.push(`${segment.segmentId}: hard limit, added credential`);
      }
      continue;
    }
    const sources = segment.sourceCvItemIds.map((id) => itemTexts.get(id));
    if (sources.some((source) => source === undefined)) {
      issues.push(`${segment.segmentId}: unknown base CV item`);
      continue;
    }
    const sourceText = sources.join("\n");
    const sourceNumbers = new Set(numericTokens(sourceText));
    if (
      numericTokens(withoutLexiconTerms(segment.text)).some((token) => !sourceNumbers.has(token))
    ) {
      issues.push(`${segment.segmentId}: number not in cited base items`);
    }
  }
  if (issues.length > 0) return err(semanticError(issues));

  const cv = mapSegments(draft.data, (segment) => {
    if (segment.provenance !== "original") return segment;
    const identical = segment.sourceCvItemIds.some((id) => {
      const source = itemTexts.get(id);
      return source !== undefined && normalizeForMatch(source) === normalizeForMatch(segment.text);
    });
    if (identical) return segment;
    promotedSegmentIds.push(segment.segmentId);
    return { ...segment, provenance: "rewritten" };
  });

  return ok({
    cv,
    requirements,
    promotedSegmentIds,
    injectionSuspected: output.injectionSuspected,
    injectionEvidence: output.injectionEvidence,
  });
}

// ---------------------------------------------------------------------------------------------------
// cv-humanize
// ---------------------------------------------------------------------------------------------------

export interface ParsedCvHumanization extends InjectionReport {
  cv: TailoredCvContent;
  /** Segments whose new text failed preservation or introduced a marker (previous text kept). */
  revertedSegmentIds: string[];
}

/**
 * Preservation (humanizer-cv-rules.md §3.1, career-prompts.md §4): same segments in the same order (else the
 * whole output is invalid); per segment, same numbers, no entity added or removed and no new lint marker,
 * otherwise the previous text is kept. A changed `original` segment becomes `rewritten`; `added` stays `added`.
 */
export function parseCvHumanizeResponse(
  raw: unknown,
  context: { before: TailoredCvContent },
): Result<ParsedCvHumanization, EngineError> {
  const parsed = CvHumanizationOutputSchema.safeParse(raw);
  if (!parsed.success) return err(schemaError(parsed.error));
  const before = listSegments(context.before);
  const output = parsed.data.segments;
  const expectedIds = before.map(({ segment }) => segment.segmentId);
  if (
    output.length !== expectedIds.length ||
    output.some((segment, index) => segment.segmentId !== expectedIds[index])
  ) {
    return err(semanticError(["segments: ids, order or count changed"]));
  }

  const language = context.before.language;
  const blocks = new Map(before.map(({ segment, block }) => [segment.segmentId, block]));
  const updates = new Map(output.map((segment) => [segment.segmentId, segment]));
  const revertedSegmentIds: string[] = [];

  const cv = mapSegments(context.before, (segment: CvSegment): CvSegment => {
    const update = updates.get(segment.segmentId);
    if (!update?.changed || update.text === segment.text) return segment;
    const block = blocks.get(segment.segmentId) ?? "bullet";
    const oldEntities = entityTokens(segment.text);
    const newEntities = entityTokens(update.text);
    const entitiesKept =
      [...oldEntities].every((token) => newEntities.has(token)) &&
      [...newEntities].every((token) => oldEntities.has(token));
    const oldMarkers = new Set(
      lintText(segment.segmentId, segment.text, language, block).map((f) => f.entryId),
    );
    const newMarker = lintText(segment.segmentId, update.text, language, block).some(
      (finding) => !oldMarkers.has(finding.entryId),
    );
    if (!sameNumbers(segment.text, update.text) || !entitiesKept || newMarker) {
      revertedSegmentIds.push(segment.segmentId);
      return segment;
    }
    return {
      ...segment,
      text: update.text,
      provenance: segment.provenance === "original" ? "rewritten" : segment.provenance,
    };
  });

  return ok({
    cv,
    revertedSegmentIds,
    injectionSuspected: parsed.data.injectionSuspected,
    injectionEvidence: parsed.data.injectionEvidence,
  });
}
