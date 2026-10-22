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
import { CV_COMPETENCY_LEXICON } from "./lint/cv-competency-lexicon.v1.0.1.js";

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

/**
 * Deny terms as folded token sequences, longest first (`cv-competency-lexicon` `denyTerms`). `lexicon-only`
 * groups never match at runtime: they only keep short forms out of the lexicon (Pena review §6.6 R4).
 */
const DENY_FORMS: ReadonlyArray<{ words: readonly string[]; capitalizedOnly: boolean }> =
  CV_COMPETENCY_LEXICON.denyTerms
    .filter((group) => group.match !== "lexicon-only")
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
 * `capitalized` terms only when written as a name (`Rede`, never the common word `rede`). At a sentence opening a
 * `capitalized` term is a name too, unless it is one of its closed constructions (`COMMON_OPENING_CONSTRUCTIONS`:
 * "Rede de pipelines…", "Via API…"); "Rede delivered…" or "Meta em 2023…" is a made-up name (Sentinela, PR #89). `anyCase` ignores the
 * `capitalized` mode: a deny term the posting itself cites is a name of the posting in any spelling (Crivo).
 */
function denyMatches(
  analysed: readonly Token[],
  anyCase = false,
  covered: readonly (number | undefined)[] = [],
): { start: number; words: readonly string[] }[] {
  const matches: { start: number; words: readonly string[] }[] = [];
  for (let start = 0; start < analysed.length; start += 1) {
    const form = DENY_FORMS.find(
      (candidate) =>
        start + candidate.words.length <= analysed.length &&
        candidate.words.every((word, offset) => analysed[start + offset]?.word === word) &&
        (anyCase ||
          !candidate.capitalizedOnly ||
          (analysed[start]?.nameLike === true && !commonOpening(analysed, start, covered))),
    );
    if (form) {
      matches.push({ start, words: form.words });
      start += form.words.length - 1;
    }
  }
  return matches;
}

/** Single-word `capitalized` deny terms: names that are also common words (Via, Rede, Meta, Delta…). */
const COMMON_WORD_DENY = new Set(
  DENY_FORMS.filter((form) => form.capitalizedOnly && form.words.length === 1).map(
    (form) => form.words[0] as string,
  ),
);

/**
 * Closed, high-confidence constructions per term in which a sentence-opening `capitalized` deny term is the
 * common word, not the company (Sentinela, PR #89): "Meta de latência", "Rede de pipelines", "Via a API",
 * "Via Python". Any other combination fails closed ("Meta em 2023…", "Delta para clientes…", "Rede para
 * varejo…"): a regeneration is acceptable, an invented employer is not. `Delta` has no entry: "Delta Lake" passes
 * as a cited lexicon term, never as an opening exemption.
 */
export const COMMON_OPENING_CONSTRUCTIONS: Readonly<
  Record<string, { followers: readonly string[]; lexiconTerm: boolean }>
> = {
  meta: { followers: ["de", "da", "do"], lexiconTerm: false },
  rede: { followers: ["de", "da", "do"], lexiconTerm: false },
  via: { followers: ["a", "o", "as", "os"], lexiconTerm: true },
};

/** A sentence-opening `capitalized` deny term in one of its `COMMON_OPENING_CONSTRUCTIONS`. */
function commonOpening(
  analysed: readonly Token[],
  index: number,
  covered: readonly (number | undefined)[],
): boolean {
  const token = analysed[index];
  const next = analysed[index + 1];
  if (token?.opening !== true || !COMMON_WORD_DENY.has(token.word) || next === undefined)
    return false;
  const construction = COMMON_OPENING_CONSTRUCTIONS[token.word];
  if (construction === undefined) return false;
  return (
    construction.followers.includes(next.word) ||
    (construction.lexiconTerm && covered[index + 1] !== undefined)
  );
}

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

/** A credential word, compared folded (D4 hard limit 1): degrees, certifications and their levels. */
const CREDENTIAL_WORD =
  /^(?:certifica\p{L}*|certified|certificate\p{L}*|diploma\p{L}*|bacharel\p{L}*|bachelor\p{L}*|mestrado|mestre|master'?s|mba|ph\.?d|doutorado|doutor|licenca\p{L}*|licen[cs]e[ds]?|pos-gradua\p{L}*|foundation|practitioner|agilist|belt|associate|specialty|fundamentals)$/u;

/** Certification exam codes (`AZ-900`, `DP-203`, `SAA-C03`; Pena review §6.4). Case-sensitive: codes are caps. */
const EXAM_CODE = /^(?:AZ|DP|AI|PL|SC|MS|MB|SAA|SAP|DVA|SOA|CLF|DEA|MLS|DOP|ANS)-[A-Z]?\d{2,3}$/u;

/** What `Professional` names as a credential besides a lexicon term (`professional` alone is a common word). */
const PROFESSIONAL_CREDENTIALS = [
  ["scrum"],
  ["data", "engineer"],
  ["cloud", "architect"],
  ["machine", "learning", "engineer"],
];

/** Credential deny phrases, in any spelling (Sentinela PR #91: `solutions architect` in lowercase too). */
const CREDENTIAL_DENY_FORMS = CV_COMPETENCY_LEXICON.denyTerms
  .filter((group) => group.group.startsWith("credentials"))
  .flatMap((group) => group.terms.map((term) => tokens(term).map(fold)));

/** Head nouns of a role title (EN and PT), for titles hidden inside a credential (Sentinela S-1, PR #91). */
const ROLE_NOUNS = new Set(
  `
  architect engineer administrator admin developer analyst scientist manager consultant specialist owner
  master lead leader designer tester auditor officer arquiteto arquiteta engenheiro engenheira administrador
  administradora desenvolvedor desenvolvedora analista cientista gerente consultor consultora especialista
  `
    .split(/\s+/u)
    .filter(Boolean),
);

/**
 * Words that present what follows as a role (Sentinela PR #91): "Atuei como …", "No papel de …", "Worked as an …",
 * "In the role of …". Folded token sequences, compared right before a credential phrase (an article in between
 * is skipped). `como` and `as` alone count: "Certificado como …" or "Certified as …" is not how a credential is
 * named, so failing closed costs only a regeneration.
 */
const ROLE_INTRODUCERS = [
  "como",
  "papel de",
  "papel do",
  "papel da",
  "cargo de",
  "cargo do",
  "funcao de",
  "posicao de",
  "as",
  "role of",
  "position of",
  "capacity of",
].map((phrase) => phrase.split(" "));
const ARTICLES = new Set(["a", "an", "the", "o", "um", "uma"]);

/** Whether a role introducer stands right before position `start` of `words`. */
function introducedAsRole(words: readonly string[], start: number): boolean {
  let end = start;
  if (end > 0 && ARTICLES.has(words[end - 1] ?? "")) end -= 1;
  return ROLE_INTRODUCERS.some(
    (phrase) =>
      end - phrase.length >= 0 &&
      phrase.every((word, offset) => words[end - phrase.length + offset] === word),
  );
}

interface CredentialPhrase {
  words: string[];
  /** Position of the first word among the text's tokens. */
  start: number;
  /**
   * Per word, whether it marks the phrase as a credential beyond doubt (`Certified`, `Associate`, `Professional`,
   * an exam code…). A credential deny phrase alone (`Solutions Architect`) is a credential without a marker: it
   * reads as a role title too.
   */
  marker: boolean[];
}

/**
 * Credential phrases of a text, folded: each credential word, exam code, credential deny phrase, `expert` right
 * after a lexicon term (`Kubernetes Expert`) or `Professional` right before one (or before `Data Engineer`…),
 * extended over its sentence neighbours that are names or lexicon terms ("aws certified solutions architect",
 * "certified kubernetes"). A sentence-opening capital alone does not extend it.
 */
function credentialPhrases(text: string): CredentialPhrase[] {
  const phrases: CredentialPhrase[] = [];
  let offset = 0;
  for (const sentence of text.normalize("NFKC").split(/(?<=[.!?;:])\s+/u)) {
    const raw = tokens(sentence);
    const words = raw.map(fold);
    const covered = lexiconCoverage(words);
    const marker = words.map(
      (word, index) =>
        [word, ...word.split(/[-/]/u)].some((part) => CREDENTIAL_WORD.test(part)) ||
        EXAM_CODE.test(raw[index] ?? "") ||
        (word === "expert" && covered[index] === undefined && covered[index - 1] !== undefined) ||
        (word === "professional" &&
          covered[index] === undefined &&
          (covered[index + 1] !== undefined ||
            PROFESSIONAL_CREDENTIALS.some((phrase) =>
              phrase.every((next, offset) => words[index + 1 + offset] === next),
            ))),
    );
    const keyword = [...marker];
    for (const form of CREDENTIAL_DENY_FORMS) {
      for (let start = 0; start + form.length <= words.length; start += 1) {
        if (form.every((word, offset) => words[start + offset] === word)) {
          for (let i = 0; i < form.length; i += 1) keyword[start + i] = true;
        }
      }
    }
    const linked = (index: number) => {
      const token = raw[index] ?? "";
      const strong = /.\p{Lu}|[\p{N}+#.]/u.test(token);
      const capitalized = /^\p{Lu}/u.test(token) && index > 0;
      return keyword[index] === true || covered[index] !== undefined || strong || capitalized;
    };
    for (let index = 0; index < words.length; index += 1) {
      if (!keyword[index]) continue;
      let first = index;
      let last = index;
      while (first > 0 && linked(first - 1)) first -= 1;
      while (last + 1 < words.length && linked(last + 1)) last += 1;
      phrases.push({
        words: words.slice(first, last + 1),
        start: offset + first,
        marker: marker.slice(first, last + 1),
      });
      index = last;
    }
    offset += raw.length;
  }
  return phrases;
}

/**
 * Credential phrases of `text` that `reference` does not already hold (D4 hard limit 1; Sentinela PR #91). An
 * added segment has no reference, so any credential is new. A rewritten or changed `original` segment may keep a
 * credential phrase of its cited base items, or shorten it only while it keeps a marker ("AWS Certified"): a
 * shortened phrase without one ("Solutions Architect" out of "AWS Certified Solutions Architect") reads as a role
 * title and passes only when it is inside one of the base CV's `titles` (Sentinela S-1).
 */
export function newCredentials(
  text: string,
  reference = "",
  titles: readonly string[] = [],
): string[] {
  const allowed = credentialPhrases(reference);
  const titleWords = titles.map((title) => tokens(title).map(fold));
  const kept = (phrase: CredentialPhrase) =>
    allowed.some(
      (source) =>
        (source.words.length === phrase.words.length &&
          containsPhrase(source.words, phrase.words)) ||
        (containsPhrase(source.words, phrase.words) &&
          (phrase.marker.includes(true) ||
            titleWords.some((title) => containsPhrase(title, phrase.words)))),
    );
  return credentialPhrases(text)
    .filter((phrase) => !kept(phrase))
    .map((phrase) => phrase.words.join(" "));
}

/**
 * Role titles hidden in the base CV's credentials that `text` names as a title (Sentinela S-1, PR #91): the
 * words of a credential around its markers, up to a role noun ("solutions architect" in "AWS Certified Solutions
 * Architect", "data engineer" in "Google Professional Data Engineer", "kubernetes administrator"). A phrase of two
 * or more of those words is a title in any case; the role noun alone only when capitalized ("Architect", never
 * "backend engineer"). A title the base CV already has as an experience title (`titles`) passes.
 */
export function titlesFromCredentials(
  text: string,
  baseText: string,
  titles: readonly string[],
): string[] {
  const roles: string[][] = [];
  for (const phrase of credentialPhrases(baseText)) {
    if (!phrase.marker.includes(true)) continue;
    let run: string[] = [];
    phrase.words.forEach((word, index) => {
      if (!phrase.marker[index]) run.push(word);
      if (phrase.marker[index] || index === phrase.words.length - 1) {
        const head = run.findLastIndex((candidate) => ROLE_NOUNS.has(candidate));
        if (head >= 0) roles.push(run.slice(0, head + 1));
        run = [];
      }
    });
  }
  const raw = tokens(text);
  const words = raw.map(fold);
  const titleWords = titles.map((title) => tokens(title).map(fold));
  // Words inside a credential the text names with its marker ("Obtive a AWS Certified Solutions Architect") are
  // that credential, not a title; whether the credential itself may be there is `newCredentials`'s call. Not when
  // a role introducer presents it as a role ("Atuei como AWS Certified Solutions Architect"; Sentinela PR #91).
  const inCredential = new Set<number>();
  for (const phrase of credentialPhrases(text)) {
    if (!phrase.marker.includes(true) || introducedAsRole(words, phrase.start)) continue;
    phrase.words.forEach((_word, index) => inCredential.add(phrase.start + index));
  }
  const found = new Set<string>();
  for (const role of roles) {
    for (let length = 1; length <= role.length; length += 1) {
      const suffix = role.slice(role.length - length);
      for (let start = 0; start + length <= words.length; start += 1) {
        if (!suffix.every((word, offset) => words[start + offset] === word)) continue;
        if (length === 1 && !/^\p{Lu}/u.test(raw[start] ?? "")) continue;
        if (suffix.every((_word, offset) => inCredential.has(start + offset))) continue;
        if (titleWords.some((title) => containsPhrase(title, suffix))) continue;
        found.add(suffix.join(" "));
      }
    }
  }
  return [...found];
}

/**
 * Words that head a role title once a role introducer presents them (issue #93): the role nouns plus leadership,
 * seniority and C-level terms. Wider than `ROLE_NOUNS`, which only cuts titles out of credentials.
 */
const ROLE_TITLE_WORDS = new Set([
  ...ROLE_NOUNS,
  ...`
  lider head chefe coordenador coordenadora coordinator diretor diretora director supervisor supervisora
  presidente president cto ceo cfo coo cio cpo vp intern estagiario estagiaria trainee senior pleno junior sr jr
  `
    .split(/\s+/u)
    .filter(Boolean),
]);
/** What may follow a title's head and still be the title: seniority ("engenheiro sênior") and one complement. */
const ROLE_SENIORITY = new Set(["senior", "pleno", "junior", "sr", "jr"]);
const ROLE_COMPLEMENT = new Set(["de", "da", "do", "dos", "das", "of"]);
/** Words that list another role after the first ("engenheira e tech lead"). */
const ROLE_CONJUNCTIONS = new Set(["e", "and", "ou", "or", "&"]);
/** Words before or after `como`/`as` that make it a comparison, not a role ("bem como", "such as", "as well"). */
const COMPARISON_BEFORE = new Set(["assim", "bem", "tanto", "such", "well"]);
const COMPARISON_AFTER = new Set(["well", "soon", "long", "much", "far"]);
/** How many words after an introducer (an article skipped) may hold the title's head; after a list separator. */
const ROLE_WINDOW = 4;
const ROLE_LIST_WINDOW = 2;

interface RoleWord {
  word: string;
  /** Punctuation right after the word: a comma may list another role, anything else ends the phrase. */
  pause: "comma" | "stop" | null;
}

/** Folded words of a text for the role check: split on spaces, slashes and dashes, with the trailing pause. */
function roleWords(text: string): RoleWord[] {
  const result: RoleWord[] = [];
  for (const raw of text.normalize("NFKC").split(/[\s/\u2013\u2014-]+/u)) {
    const word = fold(raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}+#]+$/gu, ""));
    if (word.length === 0) continue;
    const trail = /[^\p{L}\p{N}+#]+$/u.exec(raw)?.[0] ?? "";
    result.push({
      word,
      pause: /[.!?;:)]/u.test(trail) ? "stop" : trail.includes(",") ? "comma" : null,
    });
  }
  return result;
}

/** Position right after a role introducer starting at `start` of `words`, or -1. */
function introducerEnd(words: readonly RoleWord[], start: number): number {
  for (const phrase of ROLE_INTRODUCERS) {
    const end = start + phrase.length;
    if (!phrase.every((word, offset) => words[start + offset]?.word === word)) continue;
    if (
      phrase.some((_word, offset) => offset < phrase.length - 1 && words[start + offset]?.pause)
    ) {
      continue;
    }
    if (words[end - 1]?.pause) continue;
    if (phrase.length === 1 && COMPARISON_BEFORE.has(words[start - 1]?.word ?? "")) continue;
    if (phrase.length === 1 && COMPARISON_AFTER.has(words[end]?.word ?? "")) continue;
    return end;
  }
  return -1;
}

/**
 * Role phrases a text presents with a role introducer (issue #93; Pena review §6.10.2), folded: from the first
 * word after the introducer (an article skipped) up to the last role title word within `ROLE_WINDOW` words, then
 * any seniority and one complement ("tech lead", "product manager", "coordenador de engenharia", "engenheiro de
 * dados sênior"), without a credential's words up to its last marker. A comma or conjunction right after it lists another role, whose head must come within
 * `ROLE_LIST_WINDOW` words ("engenheira de software, tech lead e mentora"). Without a role title word ("como
 * parte do time", "as part of") there is no phrase.
 */
function introducedRoles(text: string): string[][] {
  const words = roleWords(text);
  const phrases: string[][] = [];
  for (let index = 0; index < words.length; index += 1) {
    let start = introducerEnd(words, index);
    let window = ROLE_WINDOW;
    while (start >= 0 && start < words.length) {
      if (ARTICLES.has(words[start]?.word ?? "") && !words[start]?.pause) start += 1;
      let head = -1;
      for (let at = start; at < Math.min(words.length, start + window); at += 1) {
        if (ROLE_TITLE_WORDS.has(words[at]?.word ?? "")) head = at;
        if (words[at]?.pause) break;
      }
      if (head < 0) break;
      let end = head + 1;
      const open = () => end < words.length && !words[end - 1]?.pause;
      while (open() && ROLE_SENIORITY.has(words[end]?.word ?? "")) end += 1;
      if (open() && ROLE_COMPLEMENT.has(words[end]?.word ?? "") && end + 1 < words.length) {
        end += 2;
        while (open() && ROLE_SENIORITY.has(words[end]?.word ?? "")) end += 1;
      }
      // A credential naming the role ("como AWS Certified Solutions Architect") is `newCredentials`'s call; the
      // role is what follows its last marker.
      const phrase = words.slice(start, end).map((word) => word.word);
      const marker = phrase.findLastIndex(
        (word, at) =>
          at < phrase.length - 1 && (CREDENTIAL_WORD.test(word) || word === "professional"),
      );
      phrases.push(phrase.slice(marker + 1));
      const pause = words[end - 1]?.pause;
      if (pause === "comma") start = end;
      else if (!pause && ROLE_CONJUNCTIONS.has(words[end]?.word ?? "")) start = end + 1;
      else break;
      window = ROLE_LIST_WINDOW;
    }
  }
  return phrases;
}

/**
 * Role titles `text` presents with a role introducer that the base CV does not have (D4 hard limit 1, issue #93):
 * "Atuei como tech lead…", "Worked as a product manager…", "Fui contratado como coordenador de engenharia". A
 * role phrase passes only inside one of the base CV's experience `titles` (any case), or inside a role phrase
 * that `reference` itself introduces (the cited base items of a rewritten segment, the humanizer's text before):
 * keeping a role the base CV states is not creating one. Fails closed: a comparison it misreads as a role costs a
 * regeneration or a reverted segment.
 */
export function inventedRoleTitles(
  text: string,
  titles: readonly string[],
  reference = "",
): string[] {
  const allowed = [
    ...titles.map((title) => roleWords(title).map((word) => word.word)),
    ...introducedRoles(reference),
  ];
  return introducedRoles(text)
    .filter((phrase) => !allowed.some((source) => containsPhrase(source, phrase)))
    .map((phrase) => phrase.join(" "));
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
      for (const match of denyMatches(analysed, false, covered)) {
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
          (isCommon(token.word) || commonOpening(analysed, index, covered))
        )
          return;
        violations.push(token.word);
      });
      return [...new Set(violations)];
    },
  };
}
