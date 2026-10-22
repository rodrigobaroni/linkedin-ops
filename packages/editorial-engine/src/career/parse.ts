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
import { excerptFrom, type TailorIssue, type TailorIssueCode } from "./feedback.js";
import { sanitizeUntrustedText } from "../untrusted.js";
import {
  createEntityGuard,
  inventedRoleLabels,
  inventedRoleTitles,
  newCredentials,
  titlesFromCredentials,
  withoutLexiconTerms,
} from "./entities.js";
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

function semanticError(issues: string[], feedback?: TailorIssue[]): EngineError {
  return feedback === undefined
    ? { code: "SEMANTIC_INVALID", issues }
    : { code: "SEMANTIC_INVALID", issues, feedback };
}

/** A schema failure of `cv-tailor`: one `schema_invalid` issue, without excerpt, for the next attempt. */
function tailorSchemaError(error: z.ZodError): EngineError {
  return { ...schemaError(error), feedback: [{ code: "schema_invalid", where: "(root)" }] };
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

export interface ParsedCvTailoring extends InjectionReport {
  /** Tailored CV in display order, provenance enforced. */
  cv: TailoredCvContent;
  /** Assessment of the BASE CV after evidence verification, joined with the posting's requirements. */
  requirements: MatchedRequirement[];
  /** `original` segments whose text differs from the source and were promoted to `rewritten`. */
  promotedSegmentIds: string[];
}

/**
 * D4 hard limits (career-editorial-exception.md §3, confirmed by Rodrigo on 2026-10-22, §9). Fixed rule:
 * employer, title, dates, education, certifications and languages are never generated (copied from the base CV
 * by id); added segments carry no number absent from the base CV and no credential, rewritten and changed
 * `original` segments no credential absent from their cited items; no added or rewritten segment names an entity
 * absent from the base CV (`entities.ts`).
 */
export function parseCvTailorResponse(
  raw: unknown,
  context: { base: CvStructured; job: JobPostingExtracted; target: TargetLanguage },
): Result<ParsedCvTailoring, EngineError> {
  const parsed = CvTailoringOutputSchema.safeParse(raw);
  if (!parsed.success) return err(tailorSchemaError(parsed.error));
  const output = parsed.data;
  const { base, job } = context;
  const issues: string[] = [];
  const feedback: TailorIssue[] = [];
  /**
   * Records an issue twice: the string for logs and stored reasons, and the structured one for the next attempt,
   * whose excerpt is kept only when it occurs in `source` (the model's own text it came from).
   */
  const report = (
    text: string,
    code: TailorIssueCode,
    where: string,
    excerpt?: string | readonly string[],
    source?: string,
  ) => {
    issues.push(text);
    // Several offending words ("Globex", "Umbrella") are one structured issue each: joined they would not occur
    // in the output and the excerpt would be lost (Pena §6.12, follow-up a).
    const excerpts = excerpt === undefined || typeof excerpt === "string" ? [excerpt] : excerpt;
    for (const candidate of excerpts.length > 0 ? excerpts : [undefined]) {
      const kept =
        source === undefined ? candidate?.trim() || undefined : excerptFrom(source, candidate);
      feedback.push(kept === undefined ? { code, where } : { code, where, excerpt: kept });
    }
  };
  const itemTexts = cvItemTexts(base);
  const requirementIds = new Set(job.requirements.map((requirement) => requirement.id));

  if (output.targetLanguage !== context.target.language) {
    report(
      `targetLanguage: expected ${context.target.language}`,
      "target_language_mismatch",
      "targetLanguage",
    );
  }

  // Step 1 — assessment of the base CV, evidence verified (post-processing 2).
  const assessed = new Map(
    output.matchAssessment.requirements.map((item) => [item.requirementId, item]),
  );
  if (assessed.size !== output.matchAssessment.requirements.length) {
    report("matchAssessment: duplicate requirementId", "ids_duplicate", "matchAssessment");
  }
  for (const id of assessed.keys()) {
    if (!requirementIds.has(id)) {
      report(
        `matchAssessment: unknown requirement ${id}`,
        "requirement_unknown",
        "matchAssessment",
        id,
      );
    }
  }
  const requirements: MatchedRequirement[] = [];
  for (const requirement of job.requirements) {
    const assessment = assessed.get(requirement.id);
    if (!assessment) {
      report(
        `matchAssessment: requirement ${requirement.id} not assessed`,
        "requirement_not_assessed",
        "matchAssessment",
        requirement.id,
      );
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
    if (missing.length > 0) {
      report(`${label}: missing ${missing.join(",")}`, "ids_missing", label, missing.join(","));
    }
    if (extra.length > 0) {
      report(`${label}: unknown ${extra.join(",")}`, "ids_unknown", label, extra.join(","));
    }
    if (new Set(actual).size !== actual.length) {
      report(`${label}: duplicate id`, "ids_duplicate", label);
    }
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
  if (!draft.success) return err(tailorSchemaError(draft.error));

  // Provenance (post-processing 3) and hard limits on additions (post-processing 4).
  const baseNumbers = new Set(numericTokens(cvFullText(base)));
  const entityGuard = createEntityGuard(base, job);
  const baseText = cvFullText(base);
  const titles = base.experiences.map((experience) => experience.title);
  const promotedSegmentIds: string[] = [];
  for (const { segment, block } of listSegments(draft.data)) {
    // A role used as a label at the opening of a summary sentence or of a bullet ("Tech lead de dados com…"),
    // unless an experience title covers it; an unchanged `original` keeps the base text (issue #99, Pena §3).
    const unchangedOriginal =
      segment.provenance === "original" &&
      segment.sourceCvItemIds.some((id) => {
        const source = itemTexts.get(id);
        return (
          source !== undefined && normalizeForMatch(source) === normalizeForMatch(segment.text)
        );
      });
    const where = segment.segmentId;
    const labels =
      (block === "summary" || block === "bullet") && !unchangedOriginal
        ? inventedRoleLabels(segment.text, titles, block === "bullet")
        : [];
    if (labels.length > 0) {
      report(
        `${where}: hard limit, invented role label`,
        "invented_role_label",
        where,
        labels[0],
        segment.text,
      );
    }
    for (const id of segment.targetRequirementIds) {
      if (!requirementIds.has(id)) {
        report(`${where}: unknown requirement ${id}`, "requirement_unknown", where, id);
      }
    }
    // D4 hard limits 1, 2 and 4: no employer, title, date, institution, certification, client, project or
    // other proper noun absent from the base CV, in added and rewritten text alike.
    const entities = entityGuard.newEntities(segment.text, segment.targetRequirementIds);
    if (entities.length > 0) {
      report(`${where}: hard limit, new entity`, "new_entity", where, entities, segment.text);
    }
    // A credential's words never become a title the base CV does not have (Sentinela S-1, PR #91).
    const credentialTitles = titlesFromCredentials(segment.text, baseText, titles);
    if (credentialTitles.length > 0) {
      report(
        `${where}: hard limit, title from a credential`,
        "title_from_credential",
        where,
        credentialTitles[0],
        segment.text,
      );
    }
    if (segment.provenance === "added") {
      const addedNumber = numericTokens(withoutLexiconTerms(segment.text)).find(
        (token) => !baseNumbers.has(token),
      );
      if (addedNumber !== undefined) {
        report(
          `${where}: hard limit, added number`,
          "added_number",
          where,
          numberExcerpt(segment.text, addedNumber),
          segment.text,
        );
      }
      const credentials = newCredentials(segment.text);
      if (credentials.length > 0) {
        report(
          `${where}: hard limit, added credential`,
          "added_credential",
          where,
          credentials[0],
          segment.text,
        );
      }
      // "Atuei como tech lead…": an added segment cites no base item, so only an experience title covers a role
      // (issue #93).
      const roles = inventedRoleTitles(segment.text, titles, "", baseText);
      if (roles.length > 0) {
        report(
          `${where}: hard limit, invented role title`,
          "invented_role_title",
          where,
          roles[0],
          segment.text,
        );
      }
      continue;
    }
    const sources = segment.sourceCvItemIds.map((id) => itemTexts.get(id));
    if (sources.some((source) => source === undefined)) {
      const unknown = segment.sourceCvItemIds.filter((id) => itemTexts.get(id) === undefined);
      report(`${where}: unknown base CV item`, "base_item_unknown", where, unknown.join(","));
      continue;
    }
    const sourceText = sources.join("\n");
    // Rewritten and changed `original` text may keep a credential of its cited items, never add one (Sentinela
    // PR #91); an unchanged `original` holds exactly its source's.
    const uncited = newCredentials(segment.text, sourceText, titles);
    if (uncited.length > 0) {
      report(
        `${where}: hard limit, credential not in cited base items`,
        "credential_not_in_cited_items",
        where,
        uncited[0],
        segment.text,
      );
    }
    // A role a rewritten or original segment presents must be an experience title or a role its cited items
    // already state (issue #93).
    const rewrittenRoles = inventedRoleTitles(segment.text, titles, sourceText, baseText);
    if (rewrittenRoles.length > 0) {
      report(
        `${where}: hard limit, invented role title`,
        "invented_role_title",
        where,
        rewrittenRoles[0],
        segment.text,
      );
    }
    const sourceNumbers = new Set(numericTokens(sourceText));
    const uncitedNumber = numericTokens(withoutLexiconTerms(segment.text)).find(
      (token) => !sourceNumbers.has(token),
    );
    if (uncitedNumber !== undefined) {
      report(
        `${where}: number not in cited base items`,
        "number_not_in_cited_items",
        where,
        numberExcerpt(segment.text, uncitedNumber),
        segment.text,
      );
    }
  }
  if (issues.length > 0) return err(semanticError(issues, feedback));

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
 * whole output is invalid); per segment, same numbers, no entity added or removed, no new credential or title
 * from a base CV credential and no new lint marker, otherwise the previous text is kept. A changed `original` segment becomes `rewritten`; `added` stays `added`.
 */
export function parseCvHumanizeResponse(
  raw: unknown,
  context: { before: TailoredCvContent; base: CvStructured },
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
  const baseText = cvFullText(context.base);
  const titles = context.base.experiences.map((experience) => experience.title);

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
    // A credential the segment did not already hold (`Kafka associate`), or a title made of a base CV
    // credential's words ("data engineer" out of "Google Professional Data Engineer"), is an addition
    // (Sentinela PR #91, S-1).
    const oldTitles = new Set(titlesFromCredentials(segment.text, baseText, titles));
    const newCredential =
      newCredentials(update.text, segment.text, titles).length > 0 ||
      titlesFromCredentials(update.text, baseText, titles).some((title) => !oldTitles.has(title));
    // So is a role the segment did not already present ("Atuei com pipelines…" → "Atuei como product manager…";
    // issue #93).
    const newRole =
      inventedRoleTitles(update.text, titles, segment.text, baseText).length > 0 ||
      ((block === "summary" || block === "bullet") &&
        inventedRoleLabels(update.text, titles, block === "bullet").some(
          (label) => !inventedRoleLabels(segment.text, titles, block === "bullet").includes(label),
        ));
    if (
      !sameNumbers(segment.text, update.text) ||
      !entitiesKept ||
      newMarker ||
      newCredential ||
      newRole
    ) {
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

/**
 * The written form of a numeric token in `text` ("40%" for the canonical "40"), or the token itself: what the
 * model wrote, for the next attempt's feedback.
 */
function numberExcerpt(text: string, token: string): string {
  for (const written of text.match(/[\p{N}][\p{N}.,]*\s?%?/gu) ?? []) {
    const trimmed = written.trim();
    if (numericTokens(trimmed).includes(token)) return trimmed;
  }
  return token;
}
