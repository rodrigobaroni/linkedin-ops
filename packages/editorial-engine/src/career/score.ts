/**
 * Match score (career-prompts.md §3, post-processing 1). Computed in code only from the base-CV assessment:
 * met = 1, partial = 0.5, missing = 0; mandatory requirements weigh 70% and desirable 30%. When a posting has
 * only one kind, that kind weighs 100%. Added content never raises the score. Weights are `editorial`
 * (Pena's initial proposal); changing them is a new `version`.
 */
import type { JobRequirementKind, RequirementStatus } from "@linkedin-ops/contracts";

export const MATCH_SCORE_WEIGHTS = {
  version: "1.0.0",
  mandatory: 0.7,
  desirable: 0.3,
} as const;

const POINTS: Record<RequirementStatus, number> = { met: 1, partial: 0.5, missing: 0 };

export interface ScoredRequirement {
  kind: JobRequirementKind;
  status: RequirementStatus;
}

/** Integer 0–100. A posting without requirements scores 0 (the extractor never yields one). */
export function computeBaseScore(requirements: readonly ScoredRequirement[]): number {
  const average = (kind: JobRequirementKind): number | null => {
    const ofKind = requirements.filter((requirement) => requirement.kind === kind);
    if (ofKind.length === 0) return null;
    return ofKind.reduce((sum, requirement) => sum + POINTS[requirement.status], 0) / ofKind.length;
  };
  const mandatory = average("mandatory");
  const desirable = average("desirable");
  let score: number;
  if (mandatory === null && desirable === null) score = 0;
  else if (mandatory === null) score = desirable ?? 0;
  else if (desirable === null) score = mandatory;
  else
    score = mandatory * MATCH_SCORE_WEIGHTS.mandatory + desirable * MATCH_SCORE_WEIGHTS.desirable;
  // toFixed first: 0.75 × 0.7 is 0.5249999… in binary floating point and must round half-up to 53.
  return Math.round(Number((score * 100).toFixed(6)));
}
