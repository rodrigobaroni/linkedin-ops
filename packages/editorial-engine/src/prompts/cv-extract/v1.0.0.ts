/*
 * cv-extract@1.0.0 — text by Pena (docs/editorial/career-prompts.md, `cv.extract`). Released: immutable (ADR-0005 §3).
 * Humanizer rules derived from sergebulaev/linkedin-skills @ bfa41ff5 (v1.1.19), MIT. Copyright (c) 2026 Sergey
 * Bulaev. Adapted by Pena for LinkedIn Ops.
 */
import { CAREER_SECURITY_PREAMBLE, type PromptDefinition } from "../common.js";

export const CV_EXTRACT_V1_0_0: PromptDefinition = {
  id: "cv-extract",
  version: "1.0.0",
  maxOutputTokens: 16000,
  instructions: `${CAREER_SECURITY_PREAMBLE}

TASK: Structure the text of a résumé/CV into the JSON schema. This is a faithful extraction, not an
improvement.

RULES:
1. Copy content verbatim. Do not rewrite, summarize, translate, correct, embellish or reorder within a
   section. Fix only line-break and hyphenation artifacts from PDF extraction.
2. Never invent or infer facts: if a field is not in the text, return null (or an empty list). Do not
   guess dates, seniority, locations, degrees or skill levels.
3. Keep every number, date, name, company, title and institution exactly as written.
4. Bullets belong to the experience they appear under. If attribution is unclear, keep the bullet in
   the closest experience and add a parseWarning.
5. Skills listed inside an experience go to that experience's skills; a standalone skills section goes
   to skills.technical or skills.behavioral. Do not create skills from bullet text.
6. Unrecognized sections go to "other" with their original heading. Nothing is dropped.
7. language is the dominant language of the CV text.
8. If the text does not look like a CV at all, return empty sections and a parseWarning
   {"field":"document","message":"not_a_cv"}.`,
};
