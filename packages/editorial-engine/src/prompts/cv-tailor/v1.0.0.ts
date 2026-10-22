/*
 * cv-tailor@1.0.0 — text by Pena (docs/editorial/career-prompts.md, `cv.tailor`). Released: immutable (ADR-0005 §3).
 * Humanizer rules derived from sergebulaev/linkedin-skills @ bfa41ff5 (v1.1.19), MIT. Copyright (c) 2026 Sergey
 * Bulaev. Adapted by Pena for LinkedIn Ops.
 */
import { CAREER_SECURITY_PREAMBLE, type PromptDefinition } from "../common.js";

export const CV_TAILOR_V1_0_0: PromptDefinition = {
  id: "cv-tailor",
  version: "1.0.0",
  maxOutputTokens: 16000,
  instructions: `${CAREER_SECURITY_PREAMBLE}

TASK: Assess how well the candidate's base CV matches one job posting, then produce a tailored CV for
that posting. The candidate has explicitly authorized plausible additions under strict provenance
rules (policy "D4"). Two steps, in this order.

STEP 1 — matchAssessment (base CV only)
1. Judge each job requirement against the BASE CV exactly as given. Nothing you write in step 2 may be
   used here.
2. "met": the base CV clearly shows it. "partial": related but weaker evidence (adjacent tool, fewer
   years, implied but not stated). "missing": no evidence.
3. For "met" and "partial", cvEvidence quotes must be exact substrings of the base CV item they cite.
   No quote, no credit: if you cannot quote it, the status is "missing".
4. Do not compute a score. The score is computed by code from your statuses.

STEP 2 — tailoredCv
5. Language: write every segment in targetLanguage. A translated segment is "rewritten", never
   "original".
6. Reorder experiences' bullets, skills and the skills section by relevance to the posting. Keep
   experiences in reverse chronological order. Do not drop experiences, education, certifications
   or languages; you may drop or merge bullets only when they are irrelevant and redundant, and never
   below one bullet per experience.
7. "original": the base text, unchanged (reordering allowed). "rewritten": same facts, new wording,
   emphasis or language, using the posting's vocabulary where it is true for the candidate. Every
   original/rewritten segment cites the base CV item ids it comes from.
8. "added" (gap filling, D4): you may add plausible content that brings an EXISTING experience or the
   skills section closer to a requirement marked partial or missing — an expanded responsibility, a
   coherent competence, a bullet that fits what that role plausibly involved. Every added segment
   cites the requirement ids it targets and explains in additionNote, in Brazilian Portuguese, what
   was added and why. Prefer few, defensible additions over many.
9. HARD LIMITS on additions (never, even as "added"):
   - no new employer, job title, date or period, degree, institution, certification, licence,
     award, publication, reference or language level;
   - no change to existing dates, titles, company or institution names;
   - no new numbers (percentages, money, team size, volumes, durations, counts). Added content is
     qualitative;
   - no named clients, people or projects that are not in the base CV;
   - nothing that contradicts the base CV.
10. Never mark added content as original or rewritten, and never mark base content as added. When in
    doubt, use "added".
11. Style (cv-humanizer-rules@1.0.0): bullets start with an action verb (PT-BR: past tense, first
    person, no pronoun, e.g. "Liderei", present tense for the current role; EN: past-tense verb, no
    pronoun). Action + concrete object + result or scope. No self-praise adjectives, no clichés
    ("passionate", "results-driven", "apaixonado", "proativo", "busco novos desafios"), no markdown,
    no emoji, no em dashes in bullets, summary 2–4 sentences. Do not copy 4+ consecutive words from
    the posting.
12. The summary may be rewritten for the posting; it may contain added content only as a separate
    segment marked "added".
13. Never write anything about the posting, the company or the recruiter into the CV beyond what the
    candidate's experience supports. Never address the reader.`,
};
