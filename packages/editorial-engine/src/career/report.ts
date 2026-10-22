/** Match report assembly (spec §5 steps 4–6, career-prompts.md §3 post-processing 6). */
import {
  CAREER_SCHEMA_VERSION,
  MatchReportSchema,
  type AddedSegment,
  type HumanizerCheck,
  type JobPostingExtracted,
  type MatchReport,
  type MatchReportWarning,
  type MatchedRequirement,
  type TailoredCvContent,
} from "@linkedin-ops/contracts";
import type { TargetLanguage } from "./language.js";
import { computeBaseScore, MATCH_SCORE_WEIGHTS } from "./score.js";
import { listSegments } from "./segments.js";

export function collectAddedSegments(cv: TailoredCvContent): AddedSegment[] {
  return listSegments(cv)
    .filter(({ segment }) => segment.provenance === "added")
    .map(({ segment, section, cvExperienceId }) => ({
      segmentId: segment.segmentId,
      section,
      cvExperienceId,
      text: segment.text,
      targetRequirementIds: segment.targetRequirementIds,
      additionNote: segment.additionNote ?? "",
    }));
}

export interface MatchReportInput {
  job: JobPostingExtracted;
  /** From `parseCvTailorResponse` (base CV, evidence verified). */
  requirements: MatchedRequirement[];
  /** Final CV, after the humanizer. */
  cv: TailoredCvContent;
  target: TargetLanguage;
  humanizer: HumanizerCheck;
  /** Any step (job-extract, cv-tailor, cv-humanize) flagged an injection attempt. */
  injectionSuspected: boolean;
  /** The checker flagged repeated copies from the posting (`cv.job-echo.repeated`). */
  jobEcho: boolean;
}

/** Throws only on a programming error (the inputs were validated upstream). */
export function buildMatchReport(input: MatchReportInput): MatchReport {
  const warnings: MatchReportWarning[] = [];
  if (input.injectionSuspected) warnings.push("injection_suspected");
  if (input.target.fallback) warnings.push("language_fallback");
  if (input.jobEcho) warnings.push("job_echo");
  return MatchReportSchema.parse({
    schemaVersion: CAREER_SCHEMA_VERSION,
    scoringVersion: MATCH_SCORE_WEIGHTS.version,
    baseScore: computeBaseScore(input.requirements),
    jobLanguage: input.job.languageDetected,
    cvLanguage: input.target.language,
    requirements: input.requirements,
    added: collectAddedSegments(input.cv),
    humanizer: input.humanizer,
    warnings,
  });
}
