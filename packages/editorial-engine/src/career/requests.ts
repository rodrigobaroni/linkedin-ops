/**
 * Request builders for the Career prompts (ADR-0005 §2, career-prompts.md §0). Instructions are repository
 * constants; every piece of external text goes through `sanitize*` and into a nonce-delimited data block.
 */
import {
  structuredOutputJsonSchema,
  type CvStructured,
  type JobPostingExtracted,
  type TailoredCvContent,
} from "@linkedin-ops/contracts";
import type { LlmRequest } from "../llm/port.js";
import { CV_EXTRACT_V1_0_0 } from "../prompts/cv-extract/v1.0.0.js";
import { CV_HUMANIZE_V1_0_0 } from "../prompts/cv-humanize/v1.0.0.js";
import { CV_TAILOR_V1_1_0 } from "../prompts/cv-tailor/v1.1.0.js";
import { JOB_EXTRACT_V1_0_0 } from "../prompts/job-extract/v1.0.0.js";
import type { PromptDefinition } from "../prompts/common.js";
import type { Rng } from "../runtime.js";
import {
  dataBlock,
  detectInjectionPatterns,
  newNonce,
  sanitizeDeep,
  sanitizeUntrustedText,
} from "../untrusted.js";
import type { TargetLanguage } from "./language.js";
import { CV_LINT_RULES_VERSION, type LintFinding } from "./lint/checker.js";
import { listSegments } from "./segments.js";

/** career-prompts.md §0: CV ≤ 30,000 characters; posting ≤ 20,000. */
export const CV_TEXT_MAX_CHARS = 30_000;
export const JOB_TEXT_MAX_CHARS = 20_000;
const FIELD_MAX_CHARS = 5_000;

export const CAREER_PROMPTS = {
  "cv-extract": CV_EXTRACT_V1_0_0,
  "job-extract": JOB_EXTRACT_V1_0_0,
  "cv-tailor": CV_TAILOR_V1_1_0,
  "cv-humanize": CV_HUMANIZE_V1_0_0,
} as const satisfies Record<string, PromptDefinition>;

export interface RequestOptions {
  model: string;
  rng: Rng;
}

/** A built request plus what the caller may record about the input (never the input itself). */
export interface BuiltRequest {
  request: LlmRequest;
  /** The data was cut to the limit (recorded, never silent). */
  truncated: boolean;
  preflightInjectionFlags: string[];
}

function request(
  prompt: PromptDefinition,
  outputKey: Parameters<typeof structuredOutputJsonSchema>[0],
  model: string,
  input: string,
): LlmRequest {
  return {
    promptId: prompt.id,
    promptVersion: prompt.version,
    model,
    instructions: prompt.instructions,
    input,
    outputSchema: structuredOutputJsonSchema(outputKey),
    maxOutputTokens: prompt.maxOutputTokens,
  };
}

function metadata(fields: Record<string, unknown>): string {
  return `METADATA (system): ${JSON.stringify(fields)}`;
}

export function buildCvExtractRequest(
  input: { cvText: string },
  options: RequestOptions,
): BuiltRequest {
  const { text, truncated } = sanitizeUntrustedText(input.cvText, CV_TEXT_MAX_CHARS);
  const flags = detectInjectionPatterns(text);
  const nonce = newNonce(options.rng);
  const body = [
    metadata({ preflightInjectionFlags: flags, truncated }),
    dataBlock("cv_text", text, nonce),
  ].join("\n\n");
  return {
    request: request(CV_EXTRACT_V1_0_0, "cvExtraction", options.model, body),
    truncated,
    preflightInjectionFlags: flags,
  };
}

/** `sourceUrl` is metadata only, never followed (career-prompts.md §2). */
export function buildJobExtractRequest(
  input: { jobText: string; sourceUrl: string | null },
  options: RequestOptions,
): BuiltRequest {
  const { text, truncated } = sanitizeUntrustedText(input.jobText, JOB_TEXT_MAX_CHARS);
  const flags = detectInjectionPatterns(text);
  const nonce = newNonce(options.rng);
  const sourceUrl =
    input.sourceUrl === null ? null : sanitizeUntrustedText(input.sourceUrl, 2048).text;
  const body = [
    metadata({ sourceUrl, preflightInjectionFlags: flags, truncated }),
    dataBlock("job_text", text, nonce),
  ].join("\n\n");
  return {
    request: request(JOB_EXTRACT_V1_0_0, "jobExtraction", options.model, body),
    truncated,
    preflightInjectionFlags: flags,
  };
}

export function buildCvTailorRequest(
  input: { base: CvStructured; job: JobPostingExtracted; target: TargetLanguage },
  options: RequestOptions,
): BuiltRequest {
  const base = sanitizeDeep(input.base, FIELD_MAX_CHARS);
  const job = sanitizeDeep(input.job, FIELD_MAX_CHARS);
  const nonce = newNonce(options.rng);
  const flags = detectInjectionPatterns(`${JSON.stringify(base)}\n${JSON.stringify(job)}`);
  const body = [
    metadata({ targetLanguage: input.target.language, rulesVersion: "cv-humanizer-rules@1.0.0" }),
    dataBlock("cv_base_json", JSON.stringify(base), nonce),
    dataBlock("job_extracted_json", JSON.stringify(job), nonce),
  ].join("\n\n");
  return {
    request: request(CV_TAILOR_V1_1_0, "cvTailoring", options.model, body),
    truncated: false,
    preflightInjectionFlags: flags,
  };
}

/** `attempt` is 1 for the first pass and 2–3 for regenerations (spec §5: at most 2). */
export function buildCvHumanizeRequest(
  input: { cv: TailoredCvContent; lintFindings: readonly LintFinding[]; attempt: number },
  options: RequestOptions,
): BuiltRequest {
  const segments = listSegments(input.cv).map(({ segment, section }) => ({
    segmentId: segment.segmentId,
    text: segment.text,
    provenance: segment.provenance,
    section,
  }));
  const findings = input.lintFindings.map(({ segmentId, entryId, match, scope }) => ({
    segmentId,
    entryId,
    match,
    scope,
  }));
  const data = sanitizeDeep({ segments, lintFindings: findings }, FIELD_MAX_CHARS);
  const nonce = newNonce(options.rng);
  const body = [
    metadata({
      targetLanguage: input.cv.language,
      attempt: input.attempt,
      rulesVersion: CV_LINT_RULES_VERSION,
    }),
    dataBlock("tailored_cv_json", JSON.stringify(data), nonce),
  ].join("\n\n");
  return {
    request: request(CV_HUMANIZE_V1_0_0, "cvHumanization", options.model, body),
    truncated: false,
    preflightInjectionFlags: [],
  };
}
