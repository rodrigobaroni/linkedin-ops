/**
 * D4 entity guard (career-editorial-exception.md §3, hard limits 1, 2 and 4; Sentinela PR #89). A tailored
 * segment may only name entities the base CV already names: employers, job titles, institutions,
 * certifications, dates, clients, projects and other proper nouns. The single exception is a competence term
 * (technical or behavioral requirement) that the segment explicitly targets.
 *
 * Heuristic and deterministic: an "entity candidate" is a capitalized token (at any position: a sentence may
 * open with a name, Sentinela/Crivo PR #89), an acronym, a token mixing letters with digits or symbols (`K8s`,
 * `C#`, `Node.js`) or a month name. A capitalized first word is exempt only when it is a closed-list opening
 * word (action verb, article, preposition) or appears lowercase somewhere in the base CV or the posting (a
 * common word, not a name). A cited requirement releases competence terms only: never the company's name nor a
 * word named right after an entity marker ("at Nubank", "for Itaú", "project Apollo", "cliente X").
 * Comparisons ignore case and diacritics. Spelled-out numbers and lowercase brand names are not caught.
 */
import type {
  CvStructured,
  JobPostingExtracted,
  JobRequirementCategory,
} from "@linkedin-ops/contracts";
import { cvItemTexts } from "./ids.js";

const MONTHS = foldAll([
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
const LANGUAGE_NAMES = foldAll([
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

/**
 * Closed list of words that may open a sentence or a skills entry without being a name: CV action verbs,
 * articles and prepositions, and common behavioral competences (so a translated base skill such as
 * "Communication" is not taken for a name).
 */
const OPENING_WORDS = new Set(
  `
  led lead leading built build building shipped ship delivered deliver designed design developed develop
  implemented implement migrated migrate managed manage created create launched launch reduced reduce cut
  improved improve increased increase scaled scale automated automate maintained maintain owned own ran run
  evaluated evaluate applied apply defined define drove drive established establish introduced introduce
  mentored mentor coached coach optimized optimize refactored refactor architected architect integrated
  integrate deployed deploy operated operate supported support wrote write authored author analyzed analyse
  analysed analyze modeled modelled coordinated coordinate partnered collaborated collaborate worked work
  contributed contribute hired hire trained train tested test monitored monitor secured secure standardized
  streamlined rebuilt replaced replace consolidated reviewed review presented present negotiated planned
  prioritized organized organised acted served serve took handled oversaw directed headed spearheaded
  the a an as at by for from in into on over across with within under through to of and or this these
  experienced seasoned skilled hands-on proven strong solid deep broad extensive
  communication leadership teamwork collaboration negotiation mentoring ownership adaptability organization
  planning prioritization problem solving facilitation empathy resilience autonomy accountability
  comunicacao lideranca colaboracao negociacao mentoria autonomia organizacao planejamento priorizacao
  resolucao problemas facilitacao empatia resiliencia proatividade responsabilidade trabalho equipe
  liderei lidero lidera construí construo entreguei entrego projetei projeto desenvolvi desenvolvo implantei
  implanto implementei implemento migrei migro gerenciei gerencio criei crio lancei lanço reduzi reduzo
  cortei melhorei melhoro aumentei aumento escalei automatizei automatizo mantive mantenho conduzi conduzo
  defini defino estabeleci introduzi mentorei treinei treino otimizei otimizo refatorei integrei integro
  publiquei operei opero apoiei apoio escrevi escrevo analisei analiso modelei coordenei coordeno atuei
  atuo trabalhei trabalho contribuí contribuo contratei testei testo monitorei monitoro padronizei
  simplifiquei substituí consolidei revisei reviso apresentei negociei planejei planejo priorizei organizei
  assumi dirigi chefiei avaliei avalio apliquei
  o os as um uma uns umas em no na nos nas com para por de do da dos das sobre entre durante desde
  experiente sólida sólido ampla amplo
  `
    .split(/\s+/u)
    .filter(Boolean)
    .map((word) => fold(word)),
);

/** Words right before a name of an organization, client, product or project. */
const ENTITY_MARKERS = new Set(
  `at for from client clients customer customers project projects product products company companies
  employer partner partners para cliente clientes projeto projetos produto produtos empresa empresas
  parceiro parceiros na no pela pelo junto`
    .split(/\s+/u)
    .filter(Boolean),
);

/** Lowercase without diacritics: `Sênior` and `senior` compare equal. */
function fold(word: string): string {
  return word.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function foldAll(words: readonly string[]): Set<string> {
  return new Set(words.map(fold));
}

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

/** Folded vocabulary of a text: every token, plus the parts of hyphenated or dotted tokens. */
export function vocabulary(text: string): Set<string> {
  const words = new Set<string>();
  for (const token of tokens(text)) {
    const lower = fold(token);
    words.add(lower);
    for (const part of lower.split(/[-./]/u)) if (part.length > 0) words.add(part);
  }
  return words;
}

/** Folded words that occur at least once starting with a lowercase letter: common words, not names. */
function lowercaseOccurrences(text: string): Set<string> {
  return new Set(
    tokens(text)
      .filter((token) => /^\p{Ll}/u.test(token))
      .map(fold),
  );
}

/** Folded words named right after an entity marker ("at Nubank", "project Apollo", "cliente Itaú"). */
function markedEntities(text: string): Set<string> {
  const marked = new Set<string>();
  const words = tokens(text);
  words.forEach((token, index) => {
    const next = words[index + 1];
    if (next !== undefined && ENTITY_MARKERS.has(fold(token)) && /^\p{Lu}/u.test(next)) {
      marked.add(fold(next));
    }
  });
  return marked;
}

export interface EntityCandidate {
  word: string;
  /** Capitalized only because it opens the sentence (may be exempt as an opening or common word). */
  opening: boolean;
}

/** Entity candidates of a segment (folded). */
export function entityCandidates(text: string): EntityCandidate[] {
  const candidates: EntityCandidate[] = [];
  const sentences = text.normalize("NFKC").split(/(?<=[.!?;:])\s+/u);
  for (const sentence of sentences) {
    tokens(sentence).forEach((token, index) => {
      const word = fold(token);
      const capitalized = /^\p{Lu}/u.test(token);
      const acronym = /^\p{Lu}{2,}$/u.test(token.replace(/[^\p{L}]/gu, "")) && /\p{L}/u.test(token);
      const mixed = /\p{L}/u.test(token) && /[\p{N}+#.]/u.test(token);
      const innerCaps = /.\p{Lu}/u.test(token);
      const strong = MONTHS.has(word) || acronym || mixed || innerCaps;
      if (strong || capitalized) {
        candidates.push({ word, opening: !strong && index === 0 });
      }
    });
  }
  return candidates;
}

export interface EntityGuard {
  /** Entity candidates of `text` not allowed for a segment targeting `targetRequirementIds`. */
  newEntities(text: string, targetRequirementIds: readonly string[]): string[];
}

export function createEntityGuard(base: CvStructured, job: JobPostingExtracted): EntityGuard {
  const baseText = [...cvItemTexts(base).values()].join("\n");
  const jobText = [job.title, ...job.requirements.flatMap((r) => [r.text, r.evidence])].join("\n");
  const baseWords = vocabulary(baseText);
  const commonWords = new Set([
    ...lowercaseOccurrences(baseText),
    ...lowercaseOccurrences(jobText),
  ]);
  // Never released by a requirement: the employer's name and anything named after an entity marker.
  const neverReleased = new Set([...vocabulary(job.company ?? ""), ...markedEntities(jobText)]);
  const competenceWords = new Map(
    job.requirements
      .filter((requirement) => COMPETENCE_CATEGORIES.has(requirement.category))
      .map((requirement) => [
        requirement.id,
        vocabulary(`${requirement.text}\n${requirement.evidence}`),
      ]),
  );
  return {
    newEntities(text, targetRequirementIds) {
      const allowed = (word: string) =>
        baseWords.has(word) ||
        LANGUAGE_NAMES.has(word) ||
        (!neverReleased.has(word) &&
          targetRequirementIds.some((id) => competenceWords.get(id)?.has(word) === true));
      return entityCandidates(text)
        .filter(({ word, opening }) => {
          if (opening && (OPENING_WORDS.has(word) || commonWords.has(word))) return false;
          if (allowed(word)) return false;
          const parts = word.split(/[-./]/u).filter((part) => part.length > 0);
          return !(parts.length > 1 && parts.every(allowed));
        })
        .map(({ word }) => word);
    },
  };
}
