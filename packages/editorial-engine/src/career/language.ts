/**
 * Language of the tailored CV. Rodrigo's decision of 2026-10-22 (career-editorial-exception.md §8–§9): the CV is
 * written in the posting's language when it is PT-BR or English; any other language yields an English CV and a
 * `language_fallback` warning in the report. Fixed rule, not configuration.
 */
import type { CareerLanguage, DetectedLanguage } from "@linkedin-ops/contracts";

export const FALLBACK_LANGUAGE: CareerLanguage = "en";

export interface TargetLanguage {
  language: CareerLanguage;
  fallback: boolean;
}

export function resolveTargetLanguage(jobLanguage: DetectedLanguage): TargetLanguage {
  if (jobLanguage === "other") return { language: FALLBACK_LANGUAGE, fallback: true };
  return { language: jobLanguage, fallback: false };
}
