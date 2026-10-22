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
 * Canonical value of one numeric token, so PT and EN spellings of the same number match while different
 * numbers never collide (Crivo PR89-2): `1,5` = `1.5`; `1.500` = `1,500` = `1500`; `1.234,56` = `1,234.56`;
 * `1.5` ≠ `15`. Rules: mixed separators → the last one is decimal; one separator repeated → thousands; a single
 * separator followed by exactly 3 digits → thousands (unless the integer part is `0`), otherwise decimal.
 * Trailing decimal zeros and leading integer zeros are dropped (`1.500,00` = `1500`).
 */
export function canonicalNumber(token: string): string {
  const separators = token.match(/[.,]/g) ?? [];
  const groups = token.split(/[.,]/);
  let decimalAt = -1;
  if (new Set(separators).size > 1) decimalAt = separators.length - 1;
  else if (separators.length === 1) {
    const [integer = "", after = ""] = groups;
    decimalAt = after.length === 3 && integer !== "0" ? -1 : 0;
  }
  const integerPart = (decimalAt === -1 ? groups : groups.slice(0, decimalAt + 1)).join("");
  const fraction =
    decimalAt === -1
      ? ""
      : groups
          .slice(decimalAt + 1)
          .join("")
          .replace(/0+$/, "");
  const integer = integerPart.replace(/^0+(?=\d)/, "");
  return fraction.length > 0 ? `${integer}.${fraction}` : integer;
}

/**
 * Numeric tokens (integers, decimals, percentages, money, years) as canonical values. Spelled-out numbers are
 * not detected.
 */
export function numericTokens(text: string): string[] {
  return (text.normalize("NFKC").match(/\d+(?:[.,]\d+)*/g) ?? []).map(canonicalNumber);
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
