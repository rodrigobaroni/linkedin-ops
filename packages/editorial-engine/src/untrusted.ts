/**
 * Untrusted-content boundary (ADR-0005 §4, docs/security/prompt-injection.md, docs/editorial/career-prompts.md
 * §0.1). External text is sanitized and travels only inside `input`, in blocks delimited by a per-call random
 * nonce, never in `instructions`. Any delimiter-looking sequence is removed from the data so it cannot close the
 * block.
 */
import type { Rng } from "./runtime.js";

/** Zero-width, bidi overrides/isolates and BOM: invisible text is an injection vector. */
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;
/** C0/C1 controls except tab and line feed. */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;
/** Opening or closing marker of a data block, whatever the nonce. */
const DELIMITER = /<<<\s*\/?\s*(?:END_)?UNTRUSTED_DATA[^>]*>>>|<<<|>>>/gi;

export interface SanitizedText {
  text: string;
  /** True when the text was cut at `maxChars` (never silently, prompt-injection.md §4.2). */
  truncated: boolean;
}

export function sanitizeUntrustedText(raw: string, maxChars: number): SanitizedText {
  const cleaned = raw
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(INVISIBLE, "")
    .replace(CONTROL, " ")
    .replace(DELIMITER, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (cleaned.length <= maxChars) return { text: cleaned, truncated: false };
  return { text: cleaned.slice(0, maxChars), truncated: true };
}

/** Strings inside structured data (base CV, extracted job) are sanitized too: their content came from outside. */
export function sanitizeDeep<T>(value: T, maxChars: number): T {
  if (typeof value === "string") return sanitizeUntrustedText(value, maxChars).text as T;
  if (Array.isArray(value)) return value.map((item: unknown) => sanitizeDeep(item, maxChars)) as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeDeep(item, maxChars)]),
    ) as T;
  }
  return value;
}

export type DataBlockKind =
  "cv_text" | "cv_base_json" | "job_text" | "job_extracted_json" | "tailored_cv_json";

/** 16-byte nonce per call (career-prompts.md §0.1). */
export function newNonce(rng: Rng): string {
  return rng.hex(32);
}

export function dataBlock(kind: DataBlockKind, content: string, nonce: string): string {
  return [
    `<<<UNTRUSTED_DATA kind="${kind}" nonce="${nonce}">>>`,
    content,
    `<<<END_UNTRUSTED_DATA nonce="${nonce}">>>`,
  ].join("\n");
}

/**
 * Pre-model heuristic (career-prompts.md §0): ids of injection-looking patterns found in the data. A flag does not
 * clean the text; it is passed to the model as `preflightInjectionFlags` and recorded.
 */
const PREFLIGHT_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  [
    "ignore-instructions",
    /ignore (?:as |todas as )?(?:instruções|instrucoes)|ignore (?:all |the )?previous/i,
  ],
  ["system-role", /(?:^|\n)\s*(?:system|sistema)\s*:/i],
  ["you-are", /(?:^|[\s.!?])(?:você é|voce e|you are) (?:um|uma|an?|the) /i],
  ["assistant", /\bassistant\b|\bassistente\b/i],
  ["approval", /\b(?:aprovad[oa]|approved?)\b.{0,40}\b(?:candidat[oa]|candidate)\b/i],
  [
    "addressed-to-ai",
    /\b(?:if you are an? (?:AI|LLM|language model)|se você (?:é|for) uma? IA|ATS)\b/i,
  ],
  [
    "rating-request",
    /\b(?:rate|score|classifique|avalie) (?:this|o|a|este|esta) (?:candidate|candidat[oa])/i,
  ],
];

export function detectInjectionPatterns(text: string): string[] {
  return PREFLIGHT_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([id]) => id);
}
