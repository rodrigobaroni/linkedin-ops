import {
  EditorialBriefSchema,
  MediaSuggestionOutputSchema,
  OpportunityClassificationSchema,
  PostDraftSchema,
  QualityEvaluationSchema,
  VoiceProfileExtractionSchema,
  type EditorialBrief,
  type MediaSuggestionOutput,
  type OpportunityClassification,
  type PostDraft,
  type QualityEvaluation,
  type VoiceProfileExtraction,
} from "../../src/index.js";
import { drop, repeat, set, type SchemaCase } from "../helpers.js";

export const opportunityClassification: OpportunityClassification = {
  schemaVersion: "1.0",
  candidateId: "cand-01",
  language: "pt-BR",
  title: "Prisma 7 muda o modelo de migrations",
  summary:
    "A fonte anuncia o novo fluxo de migrations do Prisma 7. Ele passa a gerar SQL revisável por padrão.",
  contentPillar: "engenharia",
  pillarConfidence: 0.85,
  targetAudience: "Devs backend que mantêm schemas em produção",
  relevanceReason: "Rodrigo opera Prisma em produção e já escreveu sobre migrations.",
  suggestedAngle: "O que muda na revisão de SQL antes do deploy.",
  suggestedFormat: "code-card",
  hookFormulaCandidates: ["H07", "H02"],
  storyBankHints: ["story-migrations-2024"],
  scores: { relevance: 0.9, freshness: 0.95, voiceFit: 0.7, sourceQuality: 0.8, risk: 0.1 },
  factualFlags: [],
  offLimitsHit: false,
  injectionSuspected: false,
  injectionEvidence: null,
  duplicateOf: null,
};

export const editorialBrief: EditorialBrief = {
  schemaVersion: "1.0",
  opportunityId: "opp-01",
  language: "pt-BR",
  thesis: "Migrations revisáveis reduzem incidentes de deploy.",
  angle: "A tensão entre velocidade e revisão.",
  targetReader: "Uma dev que já quebrou produção com uma migration.",
  editorialGoal: "teach",
  contentPillar: "engenharia",
  suggestedFormat: "text",
  hookFormulaOptions: [
    { formula: "H07", why: "Há um número concreto no Story Bank.", prerequisiteMet: true },
    { formula: "H02", why: "Correção de uma crença comum.", prerequisiteMet: true },
  ],
  spine: {
    moment: "O deploy das 18h",
    number: "3 incidentes",
    correction: null,
    opposition: null,
    ask: null,
  },
  factsToPreserve: [
    {
      claim: "3 incidentes em 2024",
      kind: "number",
      refType: "story-bank",
      refId: "story-migrations-2024",
      status: "supported",
    },
  ],
  sourceRefs: [{ sourceId: "src-01", usedFor: "Anúncio do novo fluxo", quote: null }],
  storyBankRefs: ["story-migrations-2024"],
  namingConstraints: ["Não citar o cliente X"],
  openQuestionsForAuthor: [],
  risks: [],
  injectionSuspected: false,
  injectionEvidence: null,
};

const altHook = (
  formula: PostDraft["formula"],
  text: string,
): PostDraft["alternativeHooks"][number] => ({
  text,
  formula,
  rationale: "Variação de ângulo.",
  introducesNewFact: false,
});

export const postDraft: PostDraft = {
  schemaVersion: "1.0",
  opportunityId: "opp-01",
  briefVersion: "1.0",
  language: "pt-BR",
  formula: "H07",
  hook: "Três incidentes em um ano me ensinaram a ler SQL de migration antes do deploy.",
  body: "Três incidentes em um ano me ensinaram a ler SQL de migration antes do deploy.\n\nO Prisma 7 passa a gerar SQL revisável por padrão.\n\n#prisma",
  charCount: 148,
  hashtags: ["prisma"],
  alternativeHooks: [
    altHook("H02", "Você não precisa confiar na migration gerada."),
    altHook("H07", "Em 2024 foram três incidentes de deploy por migration."),
    altHook("H10", "O que muda quando o SQL vira parte da revisão."),
  ],
  sourcesUsed: [{ sourceId: "src-01", usedFor: "Novo fluxo de migrations", quote: null }],
  factRefs: [
    {
      claim: "Três incidentes em um ano",
      kind: "number",
      refType: "story-bank",
      refId: "story-migrations-2024",
      status: "supported",
    },
  ],
  slots: [],
  openQuestionsForAuthor: [],
  firstCommentSuggestion: "Fonte: https://www.prisma.io/blog",
  humanization: {
    promptId: "humanize",
    paragraphDensity: [0, 0, 0],
    actions: [
      {
        pass: "scrub",
        ruleId: "cliche.reveal-bridge",
        before: "A verdade é que",
        after: "",
        reason: "ponte de revelação",
      },
    ],
    voiceConflicts: [],
    overCorrectionGuardTriggered: false,
    factsChanged: false,
  },
  injectionSuspected: false,
  injectionEvidence: null,
};

export const mediaSuggestionOutput: MediaSuggestionOutput = {
  schemaVersion: "1.0",
  type: "code-card",
  rationale: "O post gira em torno de um trecho de SQL.",
  altText: "Card com o SQL gerado pela migration, destacando a cláusula ALTER TABLE.",
  codeCard: {
    language: "sql",
    title: "Migration gerada",
    code: "ALTER TABLE posts ADD COLUMN slug text;",
    caption: null,
    sourceRef: "src-01",
  },
  quoteCard: null,
  carousel: null,
  authorImageRequest: null,
};

export const qualityEvaluation: QualityEvaluation = {
  schemaVersion: "1.0",
  draftVersionId: "ver-01",
  language: "pt-BR",
  verdict: "pass",
  scores: {
    factualFidelity: 5,
    noInventedExperience: 5,
    naturalness: 4,
    voiceMatch: 4,
    specificity: 4,
    structureAndHook: 4,
    editorialSafety: 5,
    repetition: 5,
  },
  blockers: [],
  warnings: [
    {
      ruleId: "cliche.closer",
      evidenceLabel: "editorial",
      excerpt: "E você?",
      message: "Fechamento genérico.",
      suggestedFix: null,
    },
  ],
  fabricationSuspects: [],
  clicheHits: [{ excerpt: "E você?", category: "closer", paragraphIndex: 3 }],
  readsAs: "human",
  injectionSuspected: false,
  injectionEvidence: null,
  summaryForCard:
    "Texto fiel às fontes e com voz consistente. Um fechamento genérico pode ser trocado.",
};

export const voiceProfileExtraction: VoiceProfileExtraction = {
  schemaVersion: "1.0",
  sampleCount: 3,
  rhythm: "Frases curtas, parágrafos de uma linha.",
  openers: ["Hoje quebrei produção."],
  closers: ["Se passou por isso, me conta."],
  punctuation: { emDash: "never", ellipsis: "rare", colon: "normal", parentheses: "rare" },
  casing: "standard",
  vocabularyUsed: ["deploy", "migration"],
  emojiPolicy: "none",
  formatting: "Sem listas; um pensamento por linha.",
  signatureSamples: ["Hoje quebrei produção.", "Se passou por isso, me conta."],
  confidence: 0.6,
  notesForAuthor: ["As amostras não mostram como você fala de pessoas."],
};

export const structuredOutputCases: SchemaCase[] = [
  {
    name: "OpportunityClassification",
    schema: OpportunityClassificationSchema,
    valid: opportunityClassification,
    invalid: {
      "wrong schemaVersion": set("schemaVersion", "2.0"),
      "title over 90 chars": set("title", repeat("a", 91)),
      "score out of range": set("scores.risk", 1.5),
      "missing injectionEvidence": drop("injectionEvidence"),
      "unknown format": set("suggestedFormat", "video"),
    },
  },
  {
    name: "EditorialBrief",
    schema: EditorialBriefSchema,
    valid: editorialBrief,
    invalid: {
      "single hook option": set("hookFormulaOptions", [editorialBrief.hookFormulaOptions[0]]),
      "unknown editorial goal": set("editorialGoal", "sell"),
      "spine line missing": drop("spine.ask"),
      "bad fact status": set("factsToPreserve.0.status", "maybe"),
    },
  },
  {
    name: "PostDraft",
    schema: PostDraftSchema,
    valid: postDraft,
    invalid: {
      "body over 3000 chars": set("body", repeat("x", 3001)),
      "three hashtags": set("hashtags", ["a", "b", "c"]),
      "hashtag with #": set("hashtags", ["#prisma"]),
      "two alternative hooks": set("alternativeHooks", postDraft.alternativeHooks.slice(0, 2)),
      "hook introduces new fact": set("alternativeHooks.0.introducesNewFact", true),
      "humanization changed facts": set("humanization.factsChanged", true),
      "hook over 210 chars": set("hook", repeat("h", 211)),
    },
  },
  {
    name: "MediaSuggestionOutput",
    schema: MediaSuggestionOutputSchema,
    valid: mediaSuggestionOutput,
    invalid: {
      "altText null with media": set("altText", null),
      "altText over 300 chars": set("altText", repeat("a", 301)),
      "codeCard null for code-card": set("codeCard", null),
      "two sub-objects filled": set("quoteCard", { text: "x", attribution: "Rodrigo" }),
      "type none with codeCard": set("type", "none"),
    },
  },
  {
    name: "QualityEvaluation",
    schema: QualityEvaluationSchema,
    valid: qualityEvaluation,
    invalid: {
      "rubric score 6": set("scores.naturalness", 6),
      "rubric score 0": set("scores.repetition", 0),
      "unknown verdict": set("verdict", "ok"),
      "unknown evidence label": set("warnings.0.evidenceLabel", "rumor"),
      "negative paragraph index": set("clicheHits.0.paragraphIndex", -1),
    },
  },
  {
    name: "VoiceProfileExtraction",
    schema: VoiceProfileExtractionSchema,
    valid: voiceProfileExtraction,
    invalid: {
      "one signature sample": set("signatureSamples", ["x"]),
      "confidence over 1": set("confidence", 1.2),
      "unknown casing": set("casing", "shouting"),
      "sampleCount zero": set("sampleCount", 0),
    },
  },
];
