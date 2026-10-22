/*
 * cv-humanize@1.0.0 — text by Pena (docs/editorial/career-prompts.md, `cv.humanize`). Released: immutable (ADR-0005 §3).
 * Humanizer rules derived from sergebulaev/linkedin-skills @ bfa41ff5 (v1.1.19), MIT. Copyright (c) 2026 Sergey
 * Bulaev. Adapted by Pena for LinkedIn Ops.
 */
import { CAREER_SECURITY_PREAMBLE, type PromptDefinition } from "../common.js";

export const CV_HUMANIZE_V1_0_0: PromptDefinition = {
  id: "cv-humanize",
  version: "1.0.0",
  maxOutputTokens: 12000,
  instructions: `${CAREER_SECURITY_PREAMBLE}

TASK: Remove AI-writing tells from the segments of a tailored CV, keeping meaning and facts identical.
Rules adapted from linkedin-humanizer V3 for CVs (cv-humanizer-rules@1.0.0).

RULES:
1. Return exactly the same segments, same segmentIds, same order. Never add, remove, merge or split
   segments. You cannot change provenance; it is not part of your output.
2. Keep every number, date, company, title, institution, tool and certification exactly as written.
   Never introduce a new fact, number, tool, name, responsibility or result. Never remove one.
3. Fix every lintFinding: a single-hit finding is always rewritten; for density findings, a segment
   with 3+ markers is rewritten as a whole, with 2 markers replace the weaker one. Never replace a
   flagged word with a synonym from the same family ("alavancar" → "potencializar" is not a fix).
4. Also remove, even if not flagged: self-praise adjectives, clichés, weak openers ("Responsável por",
   "Responsible for", "Worked on"), trailing participle padding (", garantindo…", ", ensuring…"),
   nominalisation openers ("A implementação de…", "The implementation of…"), negative parallelism
   ("não é só X, é Y", "it's not X, it's Y"), sincerity markers, markdown, emoji, placeholders and any
   meta-commentary.
5. Bullet style: action verb first (PT-BR past tense, first person, no pronoun; present tense for the
   current role; EN past-tense verb, no pronoun). No em dashes in bullets; in the summary at most one.
   Replace excess dashes with a comma, semicolon or colon, never a period.
6. Do not manufacture style: no staccato fragments, no rhetorical questions, no informal tone, no
   hedges ("talvez", "perhaps"), no deliberate errors. One concrete triad is fine; hollow triads
   ("eficiência, qualidade e inovação") are rewritten.
7. Proportionality: a clean segment is returned unchanged with changed = false. A clean CV gets few or
   no edits. When unsure whether something is a tell, leave it.
8. Write in targetLanguage. changeReason, when present, is a short Brazilian Portuguese note
   (≤ 120 characters) naming the tell removed.`,
};
