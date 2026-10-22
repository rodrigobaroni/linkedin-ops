/** Deterministic text helpers for the Career post-processing checks. No content is ever logged from here. */

/** Comparison form: NFKC, lowercase, typographic quotes/dashes folded, whitespace collapsed. */
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function containsNormalized(haystack: string, needle: string): boolean {
  const normalizedNeedle = normalizeForMatch(needle);
  return normalizedNeedle.length > 0 && normalizeForMatch(haystack).includes(normalizedNeedle);
}

/**
 * Numeric tokens (integers, decimals, percentages, money, years), digits only so `1.500`, `1,500` and `1500`
 * compare equal. Spelled-out numbers are not detected.
 */
export function numericTokens(text: string): string[] {
  return (text.match(/\p{N}+(?:[.,]\p{N}+)*/gu) ?? []).map((token) => token.replace(/[.,]/g, ""));
}

/** Multiset equality of numeric tokens. */
export function sameNumbers(a: string, b: string): boolean {
  const left = numericTokens(a).sort();
  const right = numericTokens(b).sort();
  return left.length === right.length && left.every((token, index) => token === right[index]);
}

/**
 * Entity-like tokens: words with an uppercase letter that do not open a sentence, or tokens mixing letters with
 * digits/symbols (`PostgreSQL`, `K8s`, `C#`, `Node.js`). Heuristic for the humanizer preservation check.
 */
export function entityTokens(text: string): Set<string> {
  const tokens = new Set<string>();
  const sentences = text.split(/(?<=[.!?;:])\s+/u);
  for (const sentence of sentences) {
    const words = sentence.split(/\s+/u).filter(Boolean);
    words.forEach((raw, index) => {
      const word = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}+#]+$/gu, "");
      if (word.length === 0) return;
      const mixed = /\p{L}/u.test(word) && /[\p{N}+#.]/u.test(word);
      const capitalized = /\p{Lu}/u.test(word);
      const innerCaps = /.\p{Lu}/u.test(word);
      if (mixed || innerCaps || (capitalized && index > 0)) tokens.add(word.toLowerCase());
    });
  }
  return tokens;
}

/** Word 4-grams, for the `job-echo` marker (4+ consecutive words copied from the posting). */
export function wordShingles(text: string, size = 4): Set<string> {
  const words = normalizeForMatch(text)
    .split(/[^\p{L}\p{N}+#]+/u)
    .filter(Boolean);
  const shingles = new Set<string>();
  for (let index = 0; index + size <= words.length; index += 1) {
    shingles.add(words.slice(index, index + size).join(" "));
  }
  return shingles;
}
