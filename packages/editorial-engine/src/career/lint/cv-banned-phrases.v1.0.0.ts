/*
 * Derived from sergebulaev/linkedin-skills @ bfa41ff5 (v1.1.19), MIT. See docs/editorial/upstream-mapping.md.
 * Sources: skills/linkedin-humanizer/SKILL.md, skills/linkedin-humanizer/references/scrub-rules.md,
 * skills/linkedin-profile-optimizer/references/experience-skills-rules.md.
 * Copyright (c) 2026 Sergey Bulaev. Adapted (PT-BR/EN, CV context) by Pena for LinkedIn Ops
 * (docs/editorial/humanizer-cv-rules.md §4). Changing an entry requires a version bump and evals.
 */

export type BannedPhraseLanguage = "any" | "pt-BR" | "en";
export type BannedPhraseScope = "single-hit" | "density";
export type BannedPhraseAction = "reject" | "flag";
/** `summary` = headline and summary; `bullet` = experience bullets; `skills` = the skills list as one block. */
export type CvBlockKind = "summary" | "bullet" | "skills";

export interface BannedPhraseEntry {
  id: string;
  language: BannedPhraseLanguage;
  tier: "forensic" | "strict" | "cv";
  scope: BannedPhraseScope;
  action: BannedPhraseAction;
  /** Regex source, compiled with `flags`. Unicode-aware word boundaries via `term()`. */
  pattern: string;
  flags: string;
  /** Restricts the entry to some blocks; absent = every block. */
  blocks?: readonly CvBlockKind[];
  evidence: "editorial" | "policy";
  note: string;
}

export interface BannedPhraseList {
  id: "cv-banned-phrases";
  version: string;
  derivedFrom: string;
  entries: readonly BannedPhraseEntry[];
}

/** `\b` does not understand accents: wrap alternatives with Unicode letter/number lookarounds (§4.1). */
function term(...alternatives: string[]): string {
  return `(?<![\\p{L}\\p{N}])(?:${alternatives.join("|")})(?![\\p{L}\\p{N}])`;
}

/** Same, anchored at the start of the block (openers, weak verbs). */
function opener(...alternatives: string[]): string {
  return `^\\s*(?:${alternatives.join("|")})(?![\\p{L}\\p{N}])`;
}

const FLAGS = "giu";

function reject(
  id: string,
  language: BannedPhraseLanguage,
  tier: BannedPhraseEntry["tier"],
  pattern: string,
  note: string,
  blocks?: readonly CvBlockKind[],
): BannedPhraseEntry {
  return {
    id,
    language,
    tier,
    scope: "single-hit",
    action: "reject",
    pattern,
    flags: FLAGS,
    ...(blocks ? { blocks } : {}),
    evidence: tier === "forensic" ? "policy" : "editorial",
    note,
  };
}

function density(id: string, language: BannedPhraseLanguage, pattern: string, note: string) {
  return {
    id,
    language,
    tier: "strict",
    scope: "density",
    action: "flag",
    pattern,
    flags: FLAGS,
    evidence: "editorial",
    note,
  } satisfies BannedPhraseEntry;
}

export const CV_BANNED_PHRASES: BannedPhraseList = {
  id: "cv-banned-phrases",
  version: "1.0.0",
  derivedFrom: "sergebulaev/linkedin-skills@bfa41ff5 (MIT)",
  entries: [
    // §4.2 Forensic (all languages).
    reject(
      "cv.any.leak.tool-markers",
      "any",
      "forensic",
      "oaicite|contentReference|turn\\d+search\\d+|attached_file|grok_card|oai_citation",
      "Tool/citation markers leaked from a chat interface.",
    ),
    reject(
      "cv.any.leak.ai-self-reference",
      "any",
      "forensic",
      term(
        "como (?:um )?modelo de (?:linguagem|IA)",
        "as an AI(?: language model)?",
        "I cannot (?:provide|browse)",
        "não tenho acesso a",
      ),
      "The model talking about itself.",
    ),
    reject(
      "cv.any.leak.cutoff",
      "any",
      "forensic",
      term("as of my (?:last update|knowledge cutoff)", "até a data do meu treinamento"),
      "Training cutoff disclaimer.",
    ),
    reject(
      "cv.any.leak.placeholder",
      "any",
      "forensic",
      [
        "\\[(?:Seu|Sua|Your|Nome|Name|Empresa|Company|Insert|Inserir|X+|Data|Date)[^\\]]*\\]",
        "\\{\\{[^}]+\\}\\}",
        "20\\d\\d-XX-XX",
        "(?<![\\p{L}\\p{N}])XX%",
        "(?<![\\p{L}\\p{N}])N anos(?![\\p{L}\\p{N}])",
        "Lorem ipsum",
      ].join("|"),
      "Unfilled template slot.",
    ),
    reject(
      "cv.any.leak.provenance-tag",
      "any",
      "forensic",
      [
        "[\\[(](?:original|reescrito|acrescentado|rewritten|added)[\\])]",
        "^\\s*(?:original|reescrito|acrescentado|rewritten|added)\\s*:",
        term("segmentId", "sourceRefs?"),
      ].join("|"),
      "Internal provenance marking must never reach the CV text (spec §8).",
    ),
    reject(
      "cv.any.leak.markdown",
      "any",
      "forensic",
      "\\*\\*|__|^#{1,6} |^\\s*[-*] \\[ \\]|```",
      "Markdown in CV text.",
    ),
    reject(
      "cv.any.leak.meta-commentary",
      "any",
      "forensic",
      [
        term(
          "aqui está (?:o|seu) (?:CV|currículo)",
          "here is (?:your|the) (?:revised|tailored) (?:CV|resume)",
          "espero que ajude",
          "I hope this helps",
        ),
        "^\\s*(?:nota|note):",
      ].join("|"),
      "Assistant commentary instead of CV text.",
    ),
    reject(
      "cv.any.emoji",
      "any",
      "forensic",
      "\\p{Extended_Pictographic}",
      "Emoji are blocked in CVs.",
    ),
    reject(
      "cv.any.prompt-echo",
      "any",
      "forensic",
      term(
        "ignore (?:as|all) (?:instruções|previous instructions)",
        "system prompt",
        "você é um assistente",
        "you are an? (?:AI|assistant)",
      ),
      "Echo of an instruction; also an injection signal.",
    ),

    // §4.3 CV layer PT-BR, single hit.
    reject(
      "cv.pt.self-praise.apaixonado",
      "pt-BR",
      "cv",
      term("apaixonad[oa]s? (?:por|pel[oa]s?)"),
      "Autoelogio sem evidência.",
    ),
    reject(
      "cv.pt.self-praise.adjectives",
      "pt-BR",
      "cv",
      term(
        "proativ[oa]s?",
        "(?<!(?:programação|tipagem|alocação|memória|análise) )dinâmic[oa]s?",
        "focad[oa]s? em resultados",
        "orientad[oa]s? a resultados",
        "visionári[oa]s?",
        "perfil inovador",
        "fora da caixa",
        "multitarefas?",
        "perfeccionista",
        "comprometid[oa]s? com a excelência",
        "sede de aprendizado",
        "brilho nos olhos",
      ),
      "Adjetivo de autoelogio; a evidência fica no bullet.",
    ),
    reject(
      "cv.pt.cliche.desafios",
      "pt-BR",
      "cv",
      term(
        "(?:em )?busca de novos desafios",
        "busco novos desafios",
        "sair da zona de conforto",
        "agregar valor",
        "fazer a diferença",
        "vestir a camisa",
        "o céu é o limite",
      ),
      "Clichê de CV.",
    ),
    reject(
      "cv.pt.opener.sou-profissional",
      "pt-BR",
      "cv",
      opener(
        "sou (?:um|uma) profissional",
        "profissional altamente",
        "profissional com vasta experiência",
      ),
      "Abertura de resumo genérica.",
      ["summary"],
    ),
    reject(
      "cv.pt.weak-verb",
      "pt-BR",
      "cv",
      opener(
        "(?:responsável por|auxiliei|participei de|ajudei a|atuei em) (?:diversas |várias |diversos |vários )?(?:atividades|demandas|projetos diversos|tarefas)",
      ),
      "Verbo fraco com objeto vago.",
      ["bullet"],
    ),
    reject(
      "cv.pt.sincerity",
      "pt-BR",
      "cv",
      term("vou ser sincer[oa]", "confesso que", "sinceramente", "para ser honest[oa]"),
      "Anúncio de sinceridade.",
    ),
    reject(
      "cv.pt.neg-parallel",
      "pt-BR",
      "cv",
      term(
        "não (?:é|são) [^.;\\n]{1,60}, (?:é|são)",
        "não (?:só|apenas) [^.;\\n]{1,60}, mas(?: também)?",
        "isso não é [^.\\n]{1,60}\\. isso é",
      ),
      "Paralelismo negativo (editorial-system.md §9.2).",
    ),

    // §4.3 CV layer PT-BR, density.
    density(
      "cv.pt.density.vocabulary",
      "pt-BR",
      term(
        "alavan(?:c|qu)\\p{L}*",
        "potencializ\\p{L}*",
        "impulsion\\p{L}*",
        "foment\\p{L}*",
        "catalis\\p{L}*",
        "empoder\\p{L}*",
        "desbloque\\p{L}*",
        "destrav\\p{L}*",
        "sinergias?",
        "holístic[oa]s?",
        "abrangentes?",
        "jornadas?",
        "paradigmas?",
        "disruptiv[oa]s?",
        "revolucion\\p{L}*",
        "transformador(?:a|es|as)?",
        "excelência",
        "expertise",
        "know-how",
        "visão estratégica",
        "perfil analítico",
        "sólida experiência",
        "vasta experiência",
        "ampla experiência",
        "forte atuação",
        "pensamento crítico",
        "soft skills",
        "endere[çc](?:ar|ando|ado|ada|ei|ou|amos)",
        "perform(?:ar|ando|ou)",
        "entregar valor",
        "garantindo",
        "assegurando",
        "contribuindo para",
        "visando",
      ),
      "Vocabulário artificial; conta para a densidade do bloco.",
    ),
    density(
      "cv.pt.density.nominalization",
      "pt-BR",
      opener("a implementação de", "a otimização de", "a gestão de"),
      "Nominalização abrindo bullet.",
    ),

    // §4.4 CV layer EN, single hit.
    reject(
      "cv.en.self-praise.passionate",
      "en",
      "cv",
      term("passionate about"),
      "Self-praise without evidence.",
    ),
    reject(
      "cv.en.self-praise.adjectives",
      "en",
      "cv",
      term(
        "results-driven",
        "results-oriented",
        "detail-oriented",
        "self-starter",
        "go-getter",
        "team player",
        "rockstar",
        "ninja",
        "guru",
        "thought leader",
        "visionary",
        "dynamic professional",
        "highly motivated",
        "think outside the box",
        "hit the ground running",
        "wear many hats",
      ),
      "Self-praise adjective.",
    ),
    reject(
      "cv.en.cliche.challenges",
      "en",
      "cv",
      term(
        "seeking new challenges",
        "looking for a challenging (?:role|position)",
        "add(?:s|ing)? value",
        "make a difference",
      ),
      "CV cliché.",
    ),
    reject(
      "cv.en.opener.i-am",
      "en",
      "cv",
      opener("I am an?", "highly skilled professional", "seasoned professional with"),
      "Generic summary opener.",
      ["summary"],
    ),
    reject(
      "cv.en.weak-verb",
      "en",
      "cv",
      opener(
        "responsible for",
        "worked on",
        "helped with",
        "assisted (?:with|in)",
        "participated in",
        "was part of",
        "handled (?:various|multiple|several|different) (?:tasks|activities|requests|projects)",
      ),
      "Weak verb opener.",
      ["bullet"],
    ),
    reject(
      "cv.en.sincerity",
      "en",
      "cv",
      term("to be honest", "honestly", "let me be clear", "I'll be real"),
      "Sincerity announcement.",
    ),
    reject(
      "cv.en.neg-parallel",
      "en",
      "cv",
      term(
        "(?:it's|it is|this is|that's) not (?:just |only |about )?[^.;\\n]{1,60}[,;] (?:it's|it is|but)",
        "not (?:just|only) [^.;\\n]{1,60}, but(?: also)?",
      ),
      "Negative parallelism.",
    ),
    reject(
      "cv.en.phrases",
      "en",
      "cv",
      term(
        "in today's fast-paced world",
        "game-changer",
        "move the needle",
        "paradigm shift",
        "testament to",
        "tapestry of",
      ),
      "Stock phrase.",
    ),

    // §4.4 CV layer EN, density.
    density(
      "cv.en.density.vocabulary",
      "en",
      term(
        "significant(?:ly)?",
        "crucial",
        "notably",
        "particularly",
        "comprehensive",
        "insights?",
        "leverag\\p{L}*",
        "foster\\p{L}*",
        "landscape",
        "nuanced",
        "multifaceted",
        "holistic",
        "streamlin\\p{L}*",
        "elevat\\p{L}*",
        "empower\\p{L}*",
        "utiliz\\p{L}*",
        "facilitat\\p{L}*",
        "harness\\p{L}*",
        "unlock\\p{L}*",
        "seamless(?:ly)?",
        "fundamentally",
        "essentially",
        "ultimately",
        "arguably",
        "certainly",
        "definitely",
        "undoubtedly",
        "spearhead\\p{L}*",
        "synerg\\p{L}*",
        "best-in-class",
        "world-class",
        "cutting-edge",
        "state-of-the-art",
        "proven track record",
        "extensive experience",
        "strong background",
        "deep expertise",
      ),
      "AI-flavoured vocabulary; counts towards block density.",
    ),
    density(
      "cv.en.density.trailing-participle",
      "en",
      ", (?:ensuring|driving|fostering)(?![\\p{L}\\p{N}])",
      "Trailing participle clause.",
    ),
    density(
      "cv.en.density.nominalization",
      "en",
      opener("the (?:implementation|optimization|management) of"),
      "Nominalisation opener.",
    ),
  ],
};
