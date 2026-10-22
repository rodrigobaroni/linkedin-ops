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

/**
 * Self-describing adjectives and adverbs that open a summary sentence ("Curious, pragmatic…", "Highly
 * experienced…", "Pragmatic engineer…"; QA of #109, issue #111): common words at an opening for the entity
 * guard, as `OPENING_WORDS`, but kept apart because the label guard reads `OPENING_WORDS` as action verbs. A
 * closed list: an adjective outside it still fails closed and costs a regeneration.
 */
const OPENING_ADJECTIVES = new Set(
  `
  curious pragmatic rigorous passionate motivated dedicated driven results-driven detail-oriented data-driven
  product-minded customer-focused self-motivated self-driven analytical creative versatile adaptable reliable
  resourceful proactive collaborative accomplished meticulous thoughtful highly deeply
  curioso curiosa pragmatico pragmatica rigoroso rigorosa apaixonado apaixonada motivado motivada dedicado
  dedicada analitico analitica criativo criativa versatil adaptavel proativo proativa colaborativo
  colaborativa meticuloso meticulosa altamente
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
 * founder, coaching, seniority and C-level terms, and roles and acronyms that follow a plain `como`/`as` ("Liderei
 * a migração como PO / SRE / gestora de TI / programadora / professora"; QA on PR #98). Wider than `ROLE_NOUNS`,
 * which only cuts titles out of credentials. `principal` and `staff` are `ROLE_MODIFIERS`, not heads.
 */
const ROLE_TITLE_WORDS = new Set([
  ...ROLE_NOUNS,
  ...`
  lider head chefe coordenador coordenadora coordinator diretor diretora director supervisor supervisora
  presidente president cto ceo cfo coo cio cpo vp intern estagiario estagiaria trainee senior pleno junior sr jr
  founder cofounder fundador fundadora cofundador cofundadora socio socia partner mentor mentora coach evangelist
  evangelista advocate steward po pm sre dba gestor gestora programador programadora programmer agilista
  recruiter recrutador recrutadora professor professora teacher instrutor instrutora instructor
  `
    .split(/\s+/u)
    .filter(Boolean),
]);

interface RoleIntroducer {
  words: string[];
  /** What follows is a role by grammar, even without a role title word ("No papel de responsável técnico"). */
  strong: boolean;
  /** A role reached ("promoted to", "became"): a credential after it names the credential, not a role. */
  promotion: boolean;
  /** "promoted from X to Y": `to`/`a`/`para` after the first role introduces the second. */
  from: boolean;
  /**
   * A first-person copula ("Fui …", "I was a …"): a word outside the base CV and the lexicon after it is a role
   * candidate even outside `ROLE_TITLE_WORDS` (Maestro on PR #98).
   */
  copula?: boolean;
  /** It names a role ("papel de", "cargo de", "role of"): what follows is a role even if it is in `NOT_ROLES`. */
  named?: boolean;
}

/**
 * Introducers for this check: `ROLE_INTRODUCERS` (the multi-word ones are strong) plus promotions (Codex review,
 * issue #93): "promoted to", "promovido a", "appointed", "nomeado" (strong); "became", "me tornei", "virei";
 * "promoted from … to …".
 */
const INTRODUCERS: RoleIntroducer[] = [
  ...ROLE_INTRODUCERS.map((words) => ({
    words,
    strong: words.length > 1,
    promotion: false,
    from: false,
    named: words.length > 1,
  })),
  ...["promoted to", "promovido a", "promovida a", "promovido para", "promovida para"]
    .concat(["appointed", "nomeado", "nomeada"])
    .map((phrase) => ({ words: phrase.split(" "), strong: true, promotion: true, from: false })),
  // A copula before a role title word ("Fui gerente de produto", "I was a product manager"; Codex review). The
  // first-person ones also make a role candidate of an unknown word ("Fui recrutador", "I was a recruiter").
  ...["fui", "sou", "i was", "i am", "i'm"].map((phrase) => ({
    words: phrase.split(" "),
    strong: false,
    promotion: false,
    from: false,
    copula: true,
  })),
  ...["era", "was", "am"].map((phrase) => ({
    words: phrase.split(" "),
    strong: false,
    promotion: false,
    from: false,
  })),
  ...["became", "become", "becoming", "me tornei", "tornei me", "virei"].map((phrase) => ({
    words: phrase.split(" "),
    strong: false,
    promotion: true,
    from: false,
  })),
  // A verb that says the candidate held the role makes `como`/`as` strong ("Atuei como recrutador"; Codex review).
  ...[
    "atuei como",
    "atuou como",
    "atuando como",
    "trabalhei como",
    "trabalhou como",
    "trabalhando como",
    "contratado como",
    "contratada como",
    "entrei como",
    "ingressei como",
    "worked as",
    "working as",
    "served as",
    "serving as",
    "acted as",
    "acting as",
    "hired as",
    "employed as",
    "joined as",
  ].map((phrase) => ({ words: phrase.split(" "), strong: true, promotion: false, from: false })),
  ...["promoted from", "promovido de", "promovida de"].map((phrase) => ({
    words: phrase.split(" "),
    strong: true,
    promotion: true,
    from: true,
  })),
];
/**
 * Words that make a role title only next to a role noun (re-QA on PR #98): before it ("principal engineer",
 * "principal desenvolvedora") they are inside the head search's phrase; after it ("engenheira principal") they are
 * seniority. Alone they are skipped ("como principal responsável", "staff de apoio").
 */
const ROLE_MODIFIERS = new Set(["principal", "staff"]);
/** What may follow a title's head and still be the title: seniority ("engenheiro sênior") and complements. */
const ROLE_SENIORITY = new Set(["senior", "pleno", "junior", "sr", "jr", ...ROLE_MODIFIERS]);
const ROLE_COMPLEMENT = new Set(["de", "da", "do", "dos", "das", "of"]);
/** Complements that attach the role to a team or area ("do time", "of the team") rather than name it. */
const ROLE_ATTACHMENTS = new Set(["da", "do", "dos", "das"]);
const ROLE_MAX_COMPLEMENTS = 3;
/**
 * A complement runs over several words ("head of data engineering"; Codex review, issue #93), up to a stop word,
 * a pause, another complement, seniority or a gerund ("engenheira de software desenvolvendo APIs", "head of data
 * leading teams"; not `ING_NOUNS`).
 */
const ROLE_COMPLEMENT_WORDS = 3;
/** Words that end the search for a title's head ("como parte do time em pagamentos", "appointed to lead"). */
const ROLE_STOP_WORDS = new Set(
  "em no na nos nas in at on for para pelo pela com with durante during after apos onde where que that which who e and ou or & to".split(
    " ",
  ),
);
/**
 * What an introducer may present that is not a role ("Atuei como parte do time", "as part of", "Served as the point
 * of contact", "I was a key contributor", "I am a strong believer", "como principal responsável"; QA on PR #98).
 * Opening the phrase (after `ROLE_MODIFIERS`), one ends that item's search ("Trabalhei como ponte entre o PO e o
 * time" never reaches "po"); the list goes on after the next conjunction or comma ("como referência e tech lead").
 */
// `go` is "go-to" ("Served as the go-to contact"; `roleWords` splits on the hyphen; Pena §6.11.1).
const NOT_ROLES = new Set(
  `parte part ponte bridge referencia reference ponto point contact contato elo apoio suporte support membro member
  interface voz voice contributor believer responsavel objetivo resultado interlocutor interlocutora articulador
  articuladora investigator go`
    .split(/\s+/u)
    .filter(Boolean),
);
/** What a first-person copula may present that is not a role ("I was the first to …", "Fui a primeira a …"). */
const COPULA_NOT_ROLES = new Set(
  `first last only main one primeiro primeira unico unica ultimo ultima under over never ever after other together
  rather later better`
    .split(/\s+/u)
    .filter(Boolean),
);
/**
 * Agentive endings (PT/EN) that make an unknown word after a first-person copula without an article a role
 * candidate ("Fui recrutador", "Sou instrutora"; Maestro on PR #98). Without an article and without one of these
 * ("Fui responsável", "Fui premiada") the word is taken as an adjective or a participle.
 */
const AGENTIVE = /(?:or|ora|er|ista|eiro|eira|ente|ante|dor|dora|ist|ian)$/u;

/** EN `-ing` words that name an area, not an action, inside a complement ("head of data engineering"). */
const ING_NOUNS = new Set(
  `engineering marketing billing pricing accounting banking consulting computing learning manufacturing networking
  processing testing sourcing branding publishing planning licensing onboarding reporting staffing recruiting
  hosting streaming`
    .split(/\s+/u)
    .filter(Boolean),
);
/** Words that list another role after the first ("engenheira e tech lead"). */
const ROLE_CONJUNCTIONS = new Set(["e", "and", "ou", "or", "&"]);
/**
 * Articles and contractions that open the object of a verb: after a list separator, a word that is no role, modifier
 * or seniority followed by one of these is a verb with its object, and the list is over ("e apoiei o PO", "and
 * supported the PM", "e cuidei do backlog"; issue #99, QA of PR #98). Asides are skipped before this check.
 */
const CLAUSE_OBJECT_OPENERS = new Set(
  "o a os as ao aos às um uma do da dos das no na nos nas pelo pela pelos pelas the an".split(" "),
);
/** "promoted from engineer to product manager", "promovido de analista a gerente". */
const ROLE_FROM_TO = new Set(["to", "a", "para"]);
/** Words before or after `como`/`as` that make it a comparison, not a role ("bem como", "such as", "as well"). */
const COMPARISON_BEFORE = new Set(["assim", "bem", "tanto", "such", "well"]);
const COMPARISON_AFTER = new Set(["well", "soon", "long", "much", "far"]);
/**
 * How many words after an introducer (an article skipped) may hold the title's head, and how many a strong
 * introducer takes as the role when none of them is a role title word. After a list separator there is no fixed
 * window: the head is searched up to the end of the clause (a pause or a stop word; Maestro on PR #98).
 */
const ROLE_WINDOW = 4;
const ROLE_STRONG_WINDOW = 3;
const ROLE_ASIDE_WORDS = 4;

interface RoleWord {
  word: string;
  /** Punctuation right after the word: a comma may list another role, anything else ends the phrase. */
  pause: "comma" | "stop" | null;
}

/** Folded words of a text for the role check: split on spaces, slashes and dashes, with the trailing pause. */
function roleWords(text: string): RoleWord[] {
  const result: RoleWord[] = [];
  // A typographic apostrophe is the ASCII one ("I’m"; QA on PR #98).
  const normalized = text.normalize("NFKC").replace(/[\u2018\u2019\u02bc]/gu, "'");
  for (const raw of normalized.split(/[\s/\u2013\u2014-]+/u)) {
    const cleaned = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}+#]+$/gu, "");
    // "às" (à + as) keeps its accent: folded it would be the introducer "as" ("às 2 PM"; re-QA on PR #98).
    const word = /^às$/iu.test(cleaned.normalize("NFC")) ? "às" : fold(cleaned);
    if (word.length === 0) continue;
    const trail = /[^\p{L}\p{N}+#]+$/u.exec(raw)?.[0] ?? "";
    result.push({
      word,
      pause: /[.!?;:)]/u.test(trail) ? "stop" : trail.includes(",") ? "comma" : null,
    });
  }
  return result;
}

/** The introducer starting at `start` of `words`, or null. */
function introducerAt(words: readonly RoleWord[], start: number): RoleIntroducer | null {
  return (
    INTRODUCERS.find((introducer) => {
      const phrase = introducer.words;
      const end = start + phrase.length;
      if (!phrase.every((word, offset) => words[start + offset]?.word === word)) return false;
      if (phrase.some((_word, offset) => words[start + offset]?.pause)) return false;
      if (introducer.promotion || phrase.length > 1) return true;
      return (
        !COMPARISON_BEFORE.has(words[start - 1]?.word ?? "") &&
        !COMPARISON_AFTER.has(words[end]?.word ?? "")
      );
    }) ?? null
  );
}

interface RolePhrase {
  words: string[];
  /** Lengths at which the phrase may end as a title: after the head (and seniority), after each complement. */
  cuts: number[];
  /**
   * The clause before the introducer ("" for "Atuei como …" or "Served as …", "a colleague" for "A colleague worked
   * as …"): who the text says holds the role, whatever the introducer's wording.
   */
  context: string;
}

/**
 * Where a role phrase whose head is at `head` ends, and the lengths at which it may end as a title (from `head`):
 * any seniority, then up to `ROLE_MAX_COMPLEMENTS` complements of up to `ROLE_COMPLEMENT_WORDS` words each
 * ("coordenador de engenharia de dados", "engenheiro de dados sênior"), short of `stop`, a pause, a gerund or
 * another complement.
 */
function extendRolePhrase(
  words: readonly RoleWord[],
  head: number,
  stop: (at: number) => boolean,
): { end: number; cuts: number[] } {
  const word = (at: number) => words[at]?.word ?? "";
  let end = head + 1;
  const open = () => end < words.length && !words[end - 1]?.pause;
  const seniority = () => {
    while (open() && ROLE_SENIORITY.has(word(end))) end += 1;
  };
  seniority();
  const cuts = [end];
  for (let complement = 0; complement < ROLE_MAX_COMPLEMENTS; complement += 1) {
    if (!open() || !ROLE_COMPLEMENT.has(word(end)) || words[end]?.pause) break;
    let next = end + 1;
    if (word(end) === "of" && ARTICLES.has(word(next)) && !words[next]?.pause) next += 1;
    const first = next;
    while (
      next < words.length &&
      next - first < ROLE_COMPLEMENT_WORDS &&
      (next === first || !words[next - 1]?.pause) &&
      !stop(next) &&
      !ROLE_COMPLEMENT.has(word(next)) &&
      !ROLE_SENIORITY.has(word(next)) &&
      !/ndo$/u.test(word(next)) &&
      !(/ing$/u.test(word(next)) && !ING_NOUNS.has(word(next)))
    ) {
      next += 1;
    }
    if (next === first) break;
    end = next;
    seniority();
    cuts.push(end);
  }
  return { end, cuts };
}

/**
 * Role phrases a text presents with a role introducer (issue #93; Pena review §6.10.2), folded. After the
 * introducer, its article and a nested introducer ("promoted to the role of …", "appointed as …"), the phrase runs
 * up to the last role title word within `ROLE_WINDOW` words, short of a stop word; a strong introducer takes up to
 * `ROLE_STRONG_WINDOW` words when there is none ("No papel de responsável técnico", "Atuei como recrutador"),
 * unless they open with one of `NOT_ROLES`. A first-person copula does the same for a word outside the base CV
 * (`vocabulary`) and the lexicon, after an article or with an `AGENTIVE` ending ("I was a recruiter", "Fui
 * recrutador"). Then any seniority and up to
 * `ROLE_MAX_COMPLEMENTS` complements ("coordenador de engenharia de dados", "engenheiro de dados sênior"), without
 * a credential's words up to its last marker. A comma or conjunction right after it lists another role, whose head
 * is searched up to the end of the clause ("engenheira de software, tech lead e mentora"; "engineer, architect, and
 * product manager"; "an engineer and technical product manager"). Without a role ("como parte do time", "as part of") there is no phrase.
 */
function introducedRoles(text: string, vocabulary: ReadonlySet<string>): RolePhrase[] {
  const words = roleWords(text);
  const covered = lexiconCoverage(words.map((role) => role.word));
  const word = (at: number) => words[at]?.word ?? "";
  const phrases: RolePhrase[] = [];
  // An aside between commas does not end a list ("e, mais tarde, tech lead", ", and later, tech lead"; QA on PR
  // #98): after a separator, up to `ROLE_ASIDE_WORDS` words without a role title word, closed by a comma.
  const afterAside = (next: number, separated: boolean) => {
    if (!separated) return next;
    for (let at = next; at < Math.min(words.length, next + ROLE_ASIDE_WORDS); at += 1) {
      if (ROLE_TITLE_WORDS.has(word(at)) || words[at]?.pause === "stop") break;
      if (words[at]?.pause === "comma") return at + 1;
    }
    return next;
  };
  // After a list separator: a verb and its object start a new clause, not another role (issue #99).
  const newClause = (at: number) =>
    !words[at]?.pause &&
    !ARTICLES.has(word(at)) &&
    !ROLE_TITLE_WORDS.has(word(at)) &&
    !ROLE_MODIFIERS.has(word(at)) &&
    !ROLE_SENIORITY.has(word(at)) &&
    CLAUSE_OBJECT_OPENERS.has(word(at + 1));
  // Past the last introducer, so "as" inside "worked as" does not count twice.
  let introduced = 0;
  for (let index = 0; index < words.length; index += 1) {
    const introducer = index < introduced ? null : introducerAt(words, index);
    if (introducer === null) continue;
    introduced = index + introducer.words.length;
    let clause = index;
    while (clause > 0 && !words[clause - 1]?.pause) clause -= 1;
    const context = words
      .slice(clause, index)
      .map((role) => role.word)
      .join(" ");
    let start = index + introducer.words.length;
    let strong = introducer.strong;
    let named = introducer.named === true;
    let promotion = introducer.promotion;
    let from = introducer.from;
    let window = ROLE_WINDOW;
    let copula = introducer.copula === true;
    while (start < words.length) {
      let article = false;
      for (let skip = 0; skip < 2; skip += 1) {
        if (ARTICLES.has(word(start)) && !words[start]?.pause) {
          start += 1;
          article = true;
        }
        const nested = introducerAt(words, start);
        if (nested === null) break;
        start += nested.words.length;
        strong ||= nested.strong;
        named ||= nested.named === true;
        promotion ||= nested.promotion;
        from ||= nested.from;
      }
      let opener = start;
      while (ROLE_MODIFIERS.has(word(opener)) && !words[opener]?.pause) opener += 1;
      const notRole = !named && NOT_ROLES.has(word(opener));
      let head = -1;
      // "Promovido de analista a analista sênior": the source role ends at `a`.
      const stop = (at: number) =>
        ROLE_STOP_WORDS.has(word(at)) || (from && ROLE_FROM_TO.has(word(at)));
      for (let at = start; !notRole && at < Math.min(words.length, start + window); at += 1) {
        if (stop(at)) break;
        // "às 2 PM" is a time, not a product manager.
        const time = word(at) === "pm" && /^\d/u.test(word(at - 1));
        if (ROLE_TITLE_WORDS.has(word(at)) && !time) head = at;
        if (words[at]?.pause) break;
      }
      const candidate =
        !notRole &&
        copula &&
        !COPULA_NOT_ROLES.has(word(opener)) &&
        !vocabulary.has(word(opener)) &&
        covered[opener] === undefined &&
        (article || (word(opener).length >= 5 && AGENTIVE.test(word(opener))));
      // After a list separator, a lone modifier with a complement is a role ("e staff da plataforma"; QA of #109).
      if (
        head < 0 &&
        window === words.length &&
        opener > start &&
        ROLE_COMPLEMENT.has(word(opener)) &&
        !words[opener - 1]?.pause
      ) {
        head = opener - 1;
      }
      if (head < 0 && !notRole && (strong || candidate)) {
        for (let at = opener; at < Math.min(words.length, opener + ROLE_STRONG_WINDOW); at += 1) {
          if (stop(at) || ROLE_COMPLEMENT.has(word(at))) break;
          head = at;
          if (words[at]?.pause) break;
        }
        if (head >= 0 && !named && NOT_ROLES.has(word(head))) head = -1;
      }
      if (head < 0) {
        // A non-role item ("como referência", "como principal") ends only its own phrase (re-QA on PR #98): the
        // list goes on after the next conjunction or comma of the clause ("como referência e tech lead").
        if (!notRole && opener === start) break;
        let next = -1;
        let separated = false;
        for (let at = opener; at < words.length; at += 1) {
          if (ROLE_CONJUNCTIONS.has(word(at))) {
            next = at + 1;
            separated = words[at]?.pause === "comma";
            break;
          }
          if (words[at]?.pause === "comma") {
            next = at + 1;
            separated = true;
            break;
          }
          if (words[at]?.pause) break;
        }
        if (next < 0) break;
        start = afterAside(next, separated);
        if (newClause(start)) break;
        strong = false;
        named = false;
        copula = false;
        window = words.length;
        continue;
      }
      const { end, cuts } = extendRolePhrase(words, head, stop);
      // A credential naming the role ("como AWS Certified Solutions Architect") is `newCredentials`'s call; the
      // role is what follows its last marker. After a promotion it is the credential itself ("Became an AWS
      // Certified …", "Became an AWS Solutions Architect Associate").
      // `Professional` only cuts the prefix: alone it does not make "a professional product manager" a credential.
      const marker = words
        .slice(start, head)
        .findLastIndex(({ word }) => CREDENTIAL_WORD.test(word) || word === "professional");
      const credential = words.slice(start, end + 1).some(({ word }) => CREDENTIAL_WORD.test(word));
      if (!(promotion && credential)) {
        const first = start + marker + 1;
        phrases.push({
          words: words.slice(first, end).map((role) => role.word),
          cuts: cuts.map((cut) => cut - first),
          context,
        });
      }
      const pause = words[end - 1]?.pause;
      if (pause === "stop") break;
      if (from && ROLE_FROM_TO.has(word(end))) {
        start = end + 1;
        from = false;
        window = ROLE_WINDOW;
        continue;
      }
      const conjunction = ROLE_CONJUNCTIONS.has(word(end));
      const separated = pause === "comma" || (conjunction && words[end]?.pause === "comma");
      if (conjunction) start = afterAside(end + 1, separated);
      else if (pause === "comma") start = afterAside(end, separated);
      else break;
      if (newClause(start)) break;
      strong = false;
      named = false;
      copula = false;
      window = words.length;
    }
  }
  return phrases;
}

/**
 * Whether a title's words cover `phrase`: some cut of the phrase occurs in the title, and either the phrase ends
 * there or what follows only attaches the role to a team ("do time", "of the team") while the title has no
 * complement of its own next. "engenheiro de dados do time" is covered by "Engenheiro de Dados"; "gerente de
 * produto" is not by "Gerente", "coordenadora de engenharia de dados" not by "Coordenadora de Engenharia de
 * Software", nor "engenheiro do time" by "Engenheiro de Dados" (Codex review, issue #93).
 *
 * Seniority may stand apart from the rest (issue #111, Pena §6.12): "senior engineer" is covered by "Senior
 * Software Engineer", because "engineer" is covered by "Software Engineer" and "senior" is the title's own
 * seniority. Only seniority: a free subsequence would let "product manager" through for "Product Marketing
 * Manager". Seniority the title does not have is never covered ("staff engineer", "senior engineer" for
 * "Software Engineer").
 */
function coversRole(title: readonly string[], phrase: RolePhrase): boolean {
  if (coversContiguous(title, phrase)) return true;
  const kept = phrase.words.flatMap((word, index) => (ROLE_SENIORITY.has(word) ? [] : [index]));
  if (kept.length === 0 || kept.length === phrase.words.length) return false;
  const seniority = new Set(title.filter((word) => ROLE_SENIORITY.has(word)));
  if (phrase.words.some((word) => ROLE_SENIORITY.has(word) && !seniority.has(word))) return false;
  const cuts = phrase.cuts.map((cut) => kept.filter((index) => index < cut).length);
  return coversContiguous(
    title.filter((word) => !ROLE_SENIORITY.has(word)),
    {
      words: kept.map((index) => phrase.words[index] as string),
      cuts: [...new Set(cuts.filter((cut) => cut > 0))],
      context: phrase.context,
    },
  );
}

function coversContiguous(title: readonly string[], phrase: RolePhrase): boolean {
  return phrase.cuts.some((cut) => {
    const next = phrase.words[cut] ?? "";
    const attached =
      ROLE_ATTACHMENTS.has(next) || (next === "of" && ARTICLES.has(phrase.words[cut + 1] ?? ""));
    if (cut < phrase.words.length && !attached) return false;
    for (let at = 0; at + cut <= title.length; at += 1) {
      if (!phrase.words.slice(0, cut).every((word, offset) => title[at + offset] === word))
        continue;
      if (cut === phrase.words.length || !ROLE_COMPLEMENT.has(title[at + cut] ?? "")) return true;
    }
    return false;
  });
}

/**
 * Role titles `text` presents with a role introducer that the base CV does not have (D4 hard limit 1, issue #93):
 * "Atuei como tech lead…", "Worked as a product manager…", "Fui contratado como coordenador de engenharia". A
 * role phrase passes only when one of the base CV's experience `titles` (any case) covers it, or when `reference`
 * (the cited base items of a rewritten segment, the humanizer's text before) states the same role for the same
 * holder, the clause before the introducer ("Atuei como tech lead" → "Trabalhei como tech lead"): keeping a role
 * the base CV states is not creating one, but "uma colega que atuou como product manager" does not make it the
 * candidate's. `baseText` is the base CV's text, whose words are not role candidates after a copula. Fails closed: a comparison it misreads as a role
 * costs a regeneration or a reverted segment.
 */
export function inventedRoleTitles(
  text: string,
  titles: readonly string[],
  reference = "",
  baseText = "",
): string[] {
  const vocabulary = new Set(roleWords(baseText).map((role) => role.word));
  const titleWords = titles.map((title) => roleWords(title).map((role) => role.word));
  const stated = introducedRoles(reference, vocabulary).map(
    (phrase) => `${phrase.context}|${phrase.words.join(" ")}`,
  );
  const invented = introducedRoles(text, vocabulary)
    .filter(
      (phrase) =>
        !titleWords.some((title) => coversRole(title, phrase)) &&
        !stated.includes(`${phrase.context}|${phrase.words.join(" ")}`),
    )
    .map((phrase) => phrase.words.join(" "));
  return [...new Set(invented)];
}

/**
 * Heads of a role used as a label (issue #99, Pena cv-tailor-1.1.0.md §3): the role nouns, the role acronyms of
 * the #98 list and the plain leadership heads ("Tech lead de dados com…", "SRE com foco…", "Líder técnica de…").
 */
const LABEL_HEADS = new Set([
  ...ROLE_NOUNS,
  ..."po pm sre dba cto ceo cfo coo cio cpo vp lider head coordenador coordenadora diretor diretora gestor gestora".split(
    " ",
  ),
]);
/** What follows a role label ("… com foco em", "… with", "… focused on", "… de dados", "… for"). */
const LABEL_FOLLOWERS = new Set([
  "com",
  "with",
  "focado",
  "focada",
  "focused",
  "de",
  "em",
  "in",
  "for",
  // QA of #109: "Head of data", "VP of engineering", "Tech lead at…", "The tech lead behind…", "Engineer who…".
  "of",
  "at",
  "on",
  "behind",
  "from",
  "who",
  "que",
  // re-QA of #109: "Tech lead obsessed with…", "apaixonada por…", "Engineering manager driving…", "experiente em…".
  "obsessed",
  "apaixonado",
  "apaixonada",
  "driving",
  "experienced",
  "experiente",
  // QA of #109 (issue #111): "engineering leader passionate about…", "Tech lead liderando…". Gerunds are a
  // closed list: a generic `-ing` would make "Developer tooling at scale…" a label again.
  "passionate",
  ...`leading building delivering shipping scaling owning helping bridging turning transforming
  liderando construindo conduzindo entregando atuando desenvolvendo gerenciando coordenando criando escalando
  apoiando ajudando transformando`
    .split(/\s+/u)
    .filter(Boolean),
]);
/**
 * The modifiers that may follow a label's head ("Engenheira backend com…", "Desenvolvedora full-stack com…"), a
 * closed list (issue #111): any word there made "Developer tooling at scale…" and "Manager dashboards on…"
 * labels. Hyphenated forms come split by `labelText` ("full-stack" is "full stack").
 */
const LABEL_POSTPOSED_MODIFIERS: readonly (readonly string[])[] = [
  "backend",
  "back end",
  "frontend",
  "front end",
  "fullstack",
  "full stack",
  "mobile",
  "cloud",
  "web",
  "ios",
  "android",
  "devops",
  "qa",
  "bi",
  "ml",
  "ai",
  "ia",
].map((modifier) => modifier.split(" "));
/** Adjectives a PT label head takes before its complement ("Líder técnica de dados"). */
const LABEL_ADJECTIVES = new Set(["tecnico", "tecnica"]);
/**
 * How many words may open a sentence before the label's head, leading articles skipped ("Senior staff data
 * engineer", "Experienced data engineer", "Hands-on staff engineer").
 */
const LABEL_WINDOW = 5;
/**
 * Leading adjectives do not count in `LABEL_WINDOW` ("Highly experienced results-driven senior data engineer…";
 * re-QA of #109): the head may be this many words further.
 */
const LABEL_MAX_ADJECTIVES = 3;
/** Leading articles skipped before the label ("A tech lead…", "Uma engenheira de dados…"; QA of #109). */
const LABEL_MAX_ARTICLES = 2;
/** Comma-separated groups of adjectives skipped before the label ("Strong, proven, hands-on, … tech lead"). */
const LABEL_MAX_ADJECTIVE_GROUPS = 4;
/** Characters that hide inside a word ("Te\u200bch lead"): removed before reading a label. */
const INVISIBLE = /[\u00ad\u200b-\u200d\u2060\ufeff]/gu;

/**
 * Text of a sentence as the label check reads it: hyphenated words joined ("hands-on", "results-driven", so the
 * halves are no stop words) and a spaced dash as a pause ("Tech Lead — pagamentos"; QA of #109).
 */
function labelText(text: string): string {
  return (
    text
      .normalize("NFKC")
      .replace(INVISIBLE, "")
      // A hyphen joins only when a half is a stop word ("hands-on", "go-to"); otherwise it separates words
      // ("Tech-lead", "results-driven"; re-QA of #109).
      .replace(/(\p{L}+)-(\p{L}+)/gu, (_match, left: string, right: string) =>
        ROLE_STOP_WORDS.has(fold(left)) || ROLE_STOP_WORDS.has(fold(right))
          ? `${left}${right}`
          : `${left} ${right}`,
      )
      .replace(/\s+[\u2013\u2014-]+\s+/gu, ", ")
  );
}

/**
 * Role titles `text` uses as a label, without an introducer, at the opening of a sentence (every sentence of
 * a summary; only the first one of a bullet, `firstSentenceOnly`): up to `LABEL_WINDOW` words ending in a
 * `LABEL_HEADS` word, then a follower, a comma or the end ("Tech lead de dados com foco em pagamentos.",
 * "Staff data engineer focused on…"). A label passes only when one of the base CV's experience `titles` covers
 * it (`coversRole`). A sentence opening with an action verb ("Led…", "Lead time…") or with an area rather than a
 * role ("Engenharia de dados em…", "Data engineering for…") is not a label. Fails closed, as `inventedRoleTitles`.
 */
export function inventedRoleLabels(
  text: string,
  titles: readonly string[],
  firstSentenceOnly = false,
): string[] {
  return inventedRoleLabelMatches(text, titles, firstSentenceOnly).map((match) => match.label);
}

export interface RoleLabelMatch {
  /** The label, folded ("handson staff engineer"). */
  label: string;
  /**
   * The words of the text that read as the label, as written ("Hands-on staff engineer"; issue #111), for the
   * feedback excerpt; undefined when no stretch of the text reads exactly as it.
   */
  excerpt: string | undefined;
}

/** `inventedRoleLabels` with the stretch of `text` each label was read from. */
export function inventedRoleLabelMatches(
  text: string,
  titles: readonly string[],
  firstSentenceOnly = false,
): RoleLabelMatch[] {
  // An invisible character may hide inside a word ("Te\u200bch lead") or between two ("Tech\u200blead"): both
  // readings are checked (Pena, labels-bypass2). Their excerpts are not the output's text: `excerptFrom` drops
  // them.
  const found = new Map<string, string | undefined>();
  const readings = /[\u00ad\u200b-\u200d\u2060\ufeff]/u.test(text)
    ? [text.replace(INVISIBLE, ""), text.replace(INVISIBLE, " ")]
    : [text];
  for (const reading of readings) {
    for (const [label, excerpt] of roleLabels(reading, titles, firstSentenceOnly)) {
      if (!found.has(label)) found.set(label, excerpt);
    }
  }
  return [...found].map(([label, excerpt]) => ({ label, excerpt }));
}

/**
 * The shortest stretch of whole space-separated tokens of `sentence`, from the start of one, that reads (as
 * `roleLabels` reads it) as `label` or begins with it ("Hands-on staff engineer" for "handson staff engineer").
 */
function literalSpan(sentence: string, label: readonly string[]): string | undefined {
  const raws = [...sentence.matchAll(/\S+/gu)];
  for (let first = 0; first < raws.length; first += 1) {
    const start = raws[first]?.index ?? 0;
    for (let last = first; last < raws.length; last += 1) {
      const raw = raws[last];
      if (raw === undefined) break;
      const span = sentence.slice(start, raw.index + raw[0].length);
      const read = roleWords(labelText(span)).map((role) => role.word);
      if (read.length < label.length) continue;
      if (label.every((word, offset) => read[offset] === word)) {
        return span.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}+#]+$/gu, "");
      }
      break;
    }
  }
  return undefined;
}

function roleLabels(
  text: string,
  titles: readonly string[],
  firstSentenceOnly: boolean,
): Map<string, string | undefined> {
  const titleWords = titles.map((title) => roleWords(labelText(title)).map((role) => role.word));
  const sentences = text.normalize("NFKC").split(/(?<=[.!?;])\s+/u);
  const found = new Map<string, string | undefined>();
  for (const sentence of firstSentenceOnly ? sentences.slice(0, 1) : sentences) {
    const words = roleWords(labelText(sentence));
    const word = (at: number) => words[at]?.word ?? "";
    // Leading articles are skipped; leading adjectives ("Experienced", "Seasoned", "Experiente") are part of the
    // window, never a reason to skip the sentence (QA of #109, Pena §6.12.1). Inside the window an article, a
    // stop word or a complement ends the search: "Hired a data engineer…", "Supported the PM…" are no labels.
    let start = 0;
    while (start < LABEL_MAX_ARTICLES && ARTICLES.has(word(start)) && !words[start]?.pause) {
      start += 1;
    }
    let head = -1;
    // Each comma-separated group of adjectives before the label moves the window ("Experienced, hands-on tech
    // lead…", "Uma profissional experiente, tech lead…"; re-QA of #109).
    let base = start;
    let groups = 0;
    for (
      let at = start;
      at < Math.min(words.length, base + LABEL_WINDOW + LABEL_MAX_ADJECTIVES);
      at += 1
    ) {
      // A role introducer ("Atuei como engenheira…", "Worked as…") makes it `inventedRoleTitles`'s phrase, and a
      // credential ("Certificação AWS Certified Solutions Architect…") `newCredentials`'s: no label.
      if (introducerAt(words, at) !== null || CREDENTIAL_WORD.test(word(at))) {
        head = -1;
        break;
      }
      // Before the head, a conjunction joins adjectives ("Pragmatic, curious and experienced data engineer…";
      // Pena, labels-bypass2).
      if (head < 0 && at > start && ROLE_CONJUNCTIONS.has(word(at)) && !words[at]?.pause) {
        continue;
      }
      if (
        ROLE_STOP_WORDS.has(word(at)) ||
        ROLE_COMPLEMENT.has(word(at)) ||
        ARTICLES.has(word(at))
      ) {
        break;
      }
      if (LABEL_HEADS.has(word(at))) head = at;
      if (words[at]?.pause === "comma" && head < 0 && groups < LABEL_MAX_ADJECTIVE_GROUPS) {
        groups += 1;
        base = at + 1;
        continue;
      }
      if (words[at]?.pause) break;
    }
    if (head < 0) continue;
    let after = head + 1;
    while (!words[after - 1]?.pause && LABEL_ADJECTIVES.has(word(after))) after += 1;
    while (!words[after - 1]?.pause && ROLE_SENIORITY.has(word(after))) after += 1;
    // Another role after a conjunction lists roles ("Tech lead e arquiteta de dados…"); a non-role does not
    // ("PM e design definiram…").
    // Another role within two words after a conjunction ("Tech lead e arquiteta…", "Team lead and engineering
    // manager…"); a non-role does not list ("PM e design definiram…").
    const listed = (at: number) =>
      ROLE_CONJUNCTIONS.has(word(at)) &&
      !words[at - 1]?.pause &&
      (ROLE_TITLE_WORDS.has(word(at + 1)) ||
        (!words[at + 1]?.pause && ROLE_TITLE_WORDS.has(word(at + 2))));
    const followed = (at: number) =>
      at >= words.length ||
      words[at - 1]?.pause !== null ||
      LABEL_FOLLOWERS.has(word(at)) ||
      listed(at);
    // One postposed modifier of `LABEL_POSTPOSED_MODIFIERS` ("Engenheira backend com…", "Desenvolvedora
    // full-stack com…"), never after a head that is also an action verb ("Lead time de entrega…").
    const modifier = LABEL_POSTPOSED_MODIFIERS.find((modifierWords) =>
      modifierWords.every(
        (modifierWord, offset) =>
          word(after + offset) === modifierWord &&
          (offset === 0 || !words[after + offset - 1]?.pause),
      ),
    );
    if (
      modifier !== undefined &&
      !OPENING_WORDS.has(word(head)) &&
      !followed(after) &&
      followed(after + modifier.length)
    ) {
      after += modifier.length;
    }
    if (!followed(after)) continue;
    // Adjectives, seniority and a modifier are part of the label; complements extend it as for an introduced role.
    const { end, cuts } = extendRolePhrase(words, after - 1, (at) => ROLE_STOP_WORDS.has(word(at)));
    // Leading articles are not part of the label ("Um engenheiro de dados sênior…" is the base title); leading
    // adjectives are ("Experienced data engineer" is not "Software Engineer").
    const phrase: RolePhrase = {
      words: words.slice(start, end).map((role) => role.word),
      cuts: [after, ...cuts].map((cut) => cut - start),
      context: "",
    };
    const label = phrase.words.join(" ");
    if (!found.has(label) && !titleWords.some((title) => coversRole(title, phrase))) {
      found.set(label, literalSpan(sentence, phrase.words));
    }
  }
  return found;
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
  const isCommon = (word: string) =>
    OPENING_WORDS.has(word) || OPENING_ADJECTIVES.has(word) || commonWords.has(word);

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
