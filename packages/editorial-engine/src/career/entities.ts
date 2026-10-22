/**
 * D4 entity guard (career-editorial-exception.md §3, hard limits 1, 2 and 4; Sentinela PR #89). A tailored
 * segment may only name entities the base CV already names: employers, job titles, institutions,
 * certifications, dates, clients, projects and other proper nouns. The single exception is a competence term
 * (technical or behavioral requirement) that the segment explicitly targets.
 *
 * Heuristic and deterministic: an "entity candidate" is a proper-noun-like token (capitalized but not opening a
 * sentence; in skill lists every capitalized token), an acronym, a token mixing letters with digits or symbols
 * (`K8s`, `C#`, `Node.js`) or a month name. Spelled-out numbers and lowercase brand names are not caught.
 */
import type {
  CvStructured,
  JobPostingExtracted,
  JobRequirementCategory,
} from "@linkedin-ops/contracts";
import { cvItemTexts } from "./ids.js";

const MONTHS = new Set([
  "janeiro",
  "fevereiro",
  "março",
  "marco",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
  "jan",
  "feb",
  "fev",
  "mar",
  "apr",
  "abr",
  "jun",
  "jul",
  "aug",
  "ago",
  "sep",
  "set",
  "oct",
  "out",
  "nov",
  "dec",
  "dez",
]);

/** Language names may be translated when the CV changes language (they are copied from the base by id). */
const LANGUAGE_NAMES = new Set([
  "english",
  "inglês",
  "ingles",
  "portuguese",
  "português",
  "portugues",
  "spanish",
  "espanhol",
  "french",
  "francês",
  "frances",
  "german",
  "alemão",
  "alemao",
  "italian",
  "italiano",
  "japanese",
  "japonês",
  "chinese",
  "chinês",
  "mandarin",
  "mandarim",
]);

/** Requirement categories whose terms a segment may adopt when it targets them ("competências"). */
const COMPETENCE_CATEGORIES: ReadonlySet<JobRequirementCategory> = new Set([
  "technical",
  "behavioral",
]);

function tokens(text: string): string[] {
  return text
    .normalize("NFKC")
    .split(/\s+/u)
    .map((raw) => raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}+#]+$/gu, ""))
    .filter((token) => token.length > 0);
}

/** Lowercase vocabulary of a text: every token, plus the parts of hyphenated or dotted tokens. */
export function vocabulary(text: string): Set<string> {
  const words = new Set<string>();
  for (const token of tokens(text)) {
    const lower = token.toLowerCase();
    words.add(lower);
    for (const part of lower.split(/[-./]/u)) if (part.length > 0) words.add(part);
  }
  return words;
}

/**
 * Entity candidates of a segment (lowercase). `listItem` = the segment is an entry of a skills list, so its
 * first word is a name, not a sentence-opening verb.
 */
export function entityCandidates(text: string, listItem: boolean): string[] {
  const candidates: string[] = [];
  const sentences = text.normalize("NFKC").split(/(?<=[.!?;:])\s+/u);
  for (const sentence of sentences) {
    tokens(sentence).forEach((token, index) => {
      const lower = token.toLowerCase();
      const capitalized = /^\p{Lu}/u.test(token);
      const acronym = /^\p{Lu}{2,}$/u.test(token.replace(/[^\p{L}]/gu, "")) && /\p{L}/u.test(token);
      const mixed = /\p{L}/u.test(token) && /[\p{N}+#.]/u.test(token);
      const innerCaps = /.\p{Lu}/u.test(token);
      if (
        MONTHS.has(lower) ||
        acronym ||
        mixed ||
        innerCaps ||
        (capitalized && (index > 0 || listItem))
      ) {
        candidates.push(lower);
      }
    });
  }
  return candidates;
}

export interface EntityGuard {
  /** Entity candidates of `text` not allowed for a segment targeting `targetRequirementIds`. */
  newEntities(text: string, targetRequirementIds: readonly string[], listItem: boolean): string[];
}

export function createEntityGuard(base: CvStructured, job: JobPostingExtracted): EntityGuard {
  const baseWords = vocabulary([...cvItemTexts(base).values()].join("\n"));
  const competenceWords = new Map(
    job.requirements
      .filter((requirement) => COMPETENCE_CATEGORIES.has(requirement.category))
      .map((requirement) => [
        requirement.id,
        vocabulary(`${requirement.text}\n${requirement.evidence}`),
      ]),
  );
  return {
    newEntities(text, targetRequirementIds, listItem) {
      const allowed = (word: string) =>
        baseWords.has(word) ||
        LANGUAGE_NAMES.has(word) ||
        targetRequirementIds.some((id) => competenceWords.get(id)?.has(word) === true);
      return entityCandidates(text, listItem).filter((word) => {
        if (allowed(word)) return false;
        const parts = word.split(/[-./]/u).filter((part) => part.length > 0);
        return !(parts.length > 1 && parts.every(allowed));
      });
    },
  };
}
