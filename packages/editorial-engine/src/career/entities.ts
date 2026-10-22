/**
 * D4 entity guard (career-editorial-exception.md §3, hard limits 1, 2 and 4; Sentinela/Crivo PR #89; Maestro's
 * decision of 2026-10-22). A tailored segment may only name what the base CV already names. Any other name —
 * employer, client, project, product, person, institution, certification, month — is rejected, with one closed
 * exception: a competence of `cv-competency-lexicon` (technology, language, framework, platform, tool,
 * protocol, methodology). A lexicon term that the base CV does not have must also appear in a requirement the
 * segment cites (`targetRequirementIds`); the requirement no longer releases any other vocabulary.
 *
 * Deterministic heuristics: a "name" is a capitalized token (a capitalized first word is exempt only when it is
 * a closed-list opening word or appears lowercase in the base CV or posting), an acronym, a token mixing letters
 * with digits or symbols (`K8s`, `C#`) or a month name. Names the posting itself uses (e.g. its company or a
 * client in a requirement) are rejected in any case, so `nubank` fails like `Nubank`. Comparisons ignore case
 * and diacritics; lexicon terms of several words match as phrases ("Google Cloud", never "Google" alone). A
 * legitimate competence missing from the lexicon costs a regeneration and is fixed by adding it to the lexicon
 * (docs/editorial/cv-competency-lexicon.md).
 */
import type { CvStructured, JobPostingExtracted } from "@linkedin-ops/contracts";
import { cvItemTexts } from "./ids.js";
import { CV_COMPETENCY_LEXICON } from "./lint/cv-competency-lexicon.v1.0.0.js";

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
  exposed expose provisioned provision guardei montei provisionei escalonei acompanhei stored store loaded load called call ingested ingest queried query cleaned transformed exportei expus armazenei carreguei chamei ingeri consultei limpei transformei packaged package tuned tune configured configure debugged debug profiled benchmarked documented document
  prototyped prototype validated validate modernized modernised upgraded upgrade resolved resolve fixed fix
  enabled enable released release rolled set saved save accelerated accelerate measured measure researched
  investigated investigate identified identify translated translate onboarded onboard used use leveraged
  orchestrated orchestrate structured restructured rewrote unified centralized centralised sustained evolved
  adapted adopted shaped guided taught ensured enhanced extended expanded instrumented migrated containerized
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
  usei uso utilizei utilizo configurei configuro depurei documentei documento prototipei validei valido
  modernizei atualizei atualizo resolvi resolvo corrigi corrijo habilitei publico acelerei medi pesquisei
  investiguei identifiquei traduzi obtive adequei adequo conclui participei ajudei garanti desenhei desenho
  estruturei orquestrei empacotei ajustei ajusto sustentei evolui reescrevi unifiquei centralizei adaptei
  adotei conduzo orientei ensinei ampliei expandi instrumentei containerizei construi
  o os as um uma uns umas em no na nos nas com para por de do da dos das sobre entre durante desde
  experiente sólida sólido ampla amplo
  `
    .split(/\s+/u)
    .filter(Boolean)
    .map((word) => fold(word)),
);

/** Typical first words of a requirement line: never harvested as names the posting uses. */
const REQUIREMENT_OPENERS = new Set(
  `
  experience experiencia knowledge conhecimento conhecimentos familiarity familiaridade vivencia proficiency
  proficiencia proficient fluency fluencia fluent advanced avancado avancada intermediate intermediario
  understanding entendimento compreensao background ability abilities habilidade habilidades skill skills
  degree graduacao formacao bachelor bacharelado previous previa anterior desirable desejavel diferencial
  nice preferred required obrigatorio must solid strong good great excellent excelente boa bom domain dominio
  comfort comfortable hands-on practical pratica proven comprovada comprovado years anos working
  `
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

/** Every spelling of every lexicon entry, as folded token sequences, longest first. */
const LEXICON_FORMS: ReadonlyArray<{ entry: number; words: readonly string[] }> =
  CV_COMPETENCY_LEXICON.entries
    .flatMap((item, entry) =>
      [item.term, ...(item.aliases ?? [])].map((form) => ({
        entry,
        words: tokens(form).map(fold),
      })),
    )
    .filter((form) => form.words.length > 0)
    .sort((a, b) => b.words.length - a.words.length);

interface LexiconSpan {
  entry: number;
  start: number;
  length: number;
}

/** Lexicon occurrences in `words`, longest match first, non-overlapping. */
function lexiconSpans(words: readonly string[]): LexiconSpan[] {
  const spans: LexiconSpan[] = [];
  for (let start = 0; start < words.length; start += 1) {
    const form = LEXICON_FORMS.find(
      (candidate) =>
        start + candidate.words.length <= words.length &&
        candidate.words.every((word, offset) => words[start + offset] === word),
    );
    if (form) {
      spans.push({ entry: form.entry, start, length: form.words.length });
      start += form.words.length - 1;
    }
  }
  return spans;
}

/** For each position of `words`, the lexicon entry whose phrase covers it (or undefined). */
function lexiconCoverage(words: readonly string[]): (number | undefined)[] {
  const covered: (number | undefined)[] = new Array<number | undefined>(words.length).fill(
    undefined,
  );
  for (const span of lexiconSpans(words)) {
    for (let i = 0; i < span.length; i += 1) covered[span.start + i] = span.entry;
  }
  return covered;
}

/**
 * The multi-word lexicon occurrence that wholly contains a deny match, if any: `Google` inside `Google Cloud`,
 * `Amazon` inside `Amazon S3`, `Oracle` inside `Oracle Database`. A deny term standing alone is never covered.
 */
function coveringSpan(
  spans: readonly LexiconSpan[],
  match: { start: number; words: readonly string[] },
): LexiconSpan | undefined {
  const end = match.start + match.words.length;
  return spans.find(
    (span) => span.length > 1 && span.start <= match.start && span.start + span.length >= end,
  );
}

/** Deny terms as folded token sequences, longest first (`cv-competency-lexicon` `denyTerms`). */
const DENY_FORMS: ReadonlyArray<{ words: readonly string[]; capitalizedOnly: boolean }> =
  CV_COMPETENCY_LEXICON.denyTerms
    .flatMap((group) =>
      group.terms.map((term) => ({
        words: tokens(term).map(fold),
        capitalizedOnly: group.match === "capitalized",
      })),
    )
    .filter((form) => form.words.length > 0)
    .sort((a, b) => b.words.length - a.words.length);

/**
 * Deny-term phrases found in analysed tokens: `any-case` terms in any spelling and position (`nubank`),
 * `capitalized` terms only when written as a name and not opening a sentence (`Rede`, never the common word
 * `rede` nor "Rede de pipelines…"; Sentinela/Pena R2). `anyCase` ignores the `capitalized` mode: a deny term the
 * posting itself cites is a name of the posting in any spelling (Crivo, PR #89).
 */
function denyMatches(
  analysed: readonly Token[],
  anyCase = false,
): { start: number; words: readonly string[] }[] {
  const matches: { start: number; words: readonly string[] }[] = [];
  for (let start = 0; start < analysed.length; start += 1) {
    const form = DENY_FORMS.find(
      (candidate) =>
        start + candidate.words.length <= analysed.length &&
        candidate.words.every((word, offset) => analysed[start + offset]?.word === word) &&
        (anyCase ||
          !candidate.capitalizedOnly ||
          (analysed[start]?.nameLike === true && analysed[start]?.opening !== true)),
    );
    if (form) {
      matches.push({ start, words: form.words });
      start += form.words.length - 1;
    }
  }
  return matches;
}

/** Single-word `capitalized` deny terms: common words, accepted when they only open a sentence (R2). */
const COMMON_WORD_DENY = new Set(
  DENY_FORMS.filter((form) => form.capitalizedOnly && form.words.length === 1).map(
    (form) => form.words[0] as string,
  ),
);

/** Lexicon entries named anywhere in a text. */
function lexiconEntries(text: string): Set<number> {
  return new Set(
    lexiconCoverage(tokens(text).map(fold)).filter((e): e is number => e !== undefined),
  );
}

/**
 * The text without the tokens of lexicon terms, for the numbers check: the digits of `ISO 27001`, `OAuth 2.0` or
 * `GA4` name a competence, not a result (the entity guard decides whether the term itself is allowed).
 */
export function withoutLexiconTerms(text: string): string {
  const words = tokens(text);
  const covered = lexiconCoverage(words.map(fold));
  return words.filter((_word, index) => covered[index] === undefined).join(" ");
}

function containsPhrase(words: readonly string[], phrase: readonly string[]): boolean {
  for (let start = 0; start + phrase.length <= words.length; start += 1) {
    if (phrase.every((word, offset) => words[start + offset] === word)) return true;
  }
  return false;
}

interface Token {
  word: string;
  /** Capitalized token, acronym, mixed token or month. */
  nameLike: boolean;
  /** Name-like only because it is capitalized and opens a sentence. */
  opening: boolean;
}

function analyse(text: string): Token[] {
  const result: Token[] = [];
  for (const sentence of text.normalize("NFKC").split(/(?<=[.!?;:])\s+/u)) {
    tokens(sentence).forEach((token, index) => {
      const word = fold(token);
      const capitalized = /^\p{Lu}/u.test(token);
      const acronym = /^\p{Lu}{2,}$/u.test(token.replace(/[^\p{L}]/gu, "")) && /\p{L}/u.test(token);
      const mixed = /\p{L}/u.test(token) && /[\p{N}+#.]/u.test(token);
      const innerCaps = /.\p{Lu}/u.test(token);
      const strong = MONTHS.has(word) || acronym || mixed || innerCaps;
      result.push({
        word,
        nameLike: strong || capitalized,
        opening: !strong && capitalized && index === 0,
      });
    });
  }
  return result;
}

/** Entity candidates of a segment (folded): its name-like tokens. */
export function entityCandidates(text: string): string[] {
  return analyse(text)
    .filter((token) => token.nameLike)
    .map((token) => token.word);
}

export interface EntityGuard {
  /** Names in `text` that the base CV does not have and the lexicon/cited requirements do not allow. */
  newEntities(text: string, targetRequirementIds: readonly string[]): string[];
}

export function createEntityGuard(base: CvStructured, job: JobPostingExtracted): EntityGuard {
  const baseText = [...cvItemTexts(base).values()].join("\n");
  const jobTexts = [
    job.title,
    ...job.keywords,
    ...job.requirements.flatMap((r) => [r.text, r.evidence]),
  ];
  const jobText = jobTexts.join("\n");
  const baseWords = vocabulary(baseText);
  const baseTokens = tokens(baseText).map(fold);
  const baseEntries = lexiconEntries(baseText);
  const commonWords = new Set([
    ...lowercaseOccurrences(baseText),
    ...lowercaseOccurrences(jobText),
  ]);
  const isCommon = (word: string) => OPENING_WORDS.has(word) || commonWords.has(word);

  // Names the posting uses that are not competences (its company, a client or project in a requirement):
  // rejected in any case. Title-cased texts (the job title, headings) are skipped: their capitals are style.
  const postingNames = new Set(vocabulary(job.company ?? ""));
  for (const requirement of job.requirements) {
    for (const text of [requirement.text, requirement.evidence]) {
      const analysed = analyse(text);
      // Clients the deny list knows are names in any spelling, even in a lowercase requirement.
      const requirementSpans = lexiconSpans(analysed.map((token) => token.word));
      for (const match of denyMatches(analysed, true)) {
        if (coveringSpan(requirementSpans, match)) continue;
        for (const word of match.words) postingNames.add(word);
      }
      const capitalized = analysed.filter((token) => /^\p{Lu}/u.test(token.word) || token.nameLike);
      if (analysed.length > 2 && capitalized.length / analysed.length > 0.6) continue;
      const covered = lexiconCoverage(analysed.map((token) => token.word));
      analysed.forEach((token, index) => {
        if (!token.nameLike || covered[index] !== undefined) return;
        if (token.opening && (isCommon(token.word) || REQUIREMENT_OPENERS.has(token.word))) return;
        if (!commonWords.has(token.word)) postingNames.add(token.word);
      });
    }
  }
  const requirementEntries = new Map(
    job.requirements.map((r) => [r.id, lexiconEntries(`${r.text}\n${r.evidence}`)]),
  );

  return {
    newEntities(text, targetRequirementIds) {
      const analysed = analyse(text);
      const words = analysed.map((token) => token.word);
      const spans = lexiconSpans(words);
      const covered = lexiconCoverage(words);
      const entryAllowed = (entry: number) =>
        baseEntries.has(entry) ||
        targetRequirementIds.some((id) => requirementEntries.get(id)?.has(entry));
      const violations: string[] = [];
      const denied = new Set<number>();
      for (const match of denyMatches(analysed)) {
        if (containsPhrase(baseTokens, match.words)) continue;
        // A brand inside an allowed multi-word competence is the product, not the company (Google Cloud).
        const span = coveringSpan(spans, match);
        if (span && entryAllowed(span.entry)) continue;
        for (let i = 0; i < match.words.length; i += 1) denied.add(match.start + i);
        violations.push(match.words.join(" "));
      }
      analysed.forEach((token, index) => {
        if (denied.has(index)) return;
        const namedByPosting = postingNames.has(token.word);
        if (!token.nameLike && !namedByPosting) return;
        const entry = covered[index];
        if (entry !== undefined) {
          if (!entryAllowed(entry)) violations.push(token.word);
          return;
        }
        if (baseWords.has(token.word) || LANGUAGE_NAMES.has(token.word)) return;
        if (
          !namedByPosting &&
          token.opening &&
          (isCommon(token.word) || COMMON_WORD_DENY.has(token.word))
        )
          return;
        violations.push(token.word);
      });
      return [...new Set(violations)];
    },
  };
}
