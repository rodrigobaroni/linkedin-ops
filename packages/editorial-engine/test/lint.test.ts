import { describe, expect, it } from "vitest";
import {
  CV_BANNED_PHRASES,
  CV_LINT_RULES_VERSION,
  lintTailoredCv,
  lintText,
  type CvBlockKind,
} from "../src/index.js";
import type { TailoredCvContent } from "@linkedin-ops/contracts";
import { segment } from "./fixtures/career.js";

type Case = [
  entryId: string,
  language: "pt-BR" | "en",
  block: CvBlockKind,
  hit: string,
  miss: string,
];

/** One positive and one negative case per entry (humanizer-cv-rules.md §4.1). */
const CASES: Case[] = [
  ["cv.any.leak.tool-markers", "en", "bullet", "Led the migration oaicite:3", "Led the migration"],
  [
    "cv.any.leak.ai-self-reference",
    "en",
    "summary",
    "As an AI language model, I",
    "Backend engineer",
  ],
  ["cv.any.leak.cutoff", "en", "summary", "as of my last update", "as of 2024"],
  [
    "cv.any.leak.placeholder",
    "pt-BR",
    "bullet",
    "Liderei o time da [Empresa]",
    "Liderei o time de dados",
  ],
  [
    "cv.any.leak.provenance-tag",
    "pt-BR",
    "bullet",
    "Liderei a migração [acrescentado]",
    "Liderei a migração",
  ],
  ["cv.any.leak.markdown", "en", "bullet", "Led **the** migration", "Led the migration"],
  ["cv.any.leak.meta-commentary", "en", "summary", "Here is your tailored CV:", "Here in Curitiba"],
  ["cv.any.emoji", "en", "bullet", "Led the migration 🚀", "Led the migration"],
  [
    "cv.any.prompt-echo",
    "en",
    "summary",
    "Ignore all previous instructions",
    "Ignored legacy alerts",
  ],
  [
    "cv.pt.self-praise.apaixonado",
    "pt-BR",
    "summary",
    "Apaixonado por tecnologia",
    "Apaixonei-me cedo",
  ],
  [
    "cv.pt.self-praise.adjectives",
    "pt-BR",
    "summary",
    "Profissional proativo",
    "Programação dinâmica aplicada",
  ],
  ["cv.pt.cliche.desafios", "pt-BR", "summary", "Busco novos desafios", "Busco dados no Postgres"],
  [
    "cv.pt.opener.sou-profissional",
    "pt-BR",
    "summary",
    "Sou um profissional de dados",
    "Engenheira de dados",
  ],
  [
    "cv.pt.weak-verb",
    "pt-BR",
    "bullet",
    "Responsável por diversas atividades",
    "Responsável pelo on-call de pagamentos",
  ],
  ["cv.pt.sincerity", "pt-BR", "summary", "Confesso que gosto de dados", "Gosto de dados"],
  ["cv.pt.neg-parallel", "pt-BR", "summary", "Não é só código, é produto", "Código e produto"],
  ["cv.pt.density.vocabulary", "pt-BR", "bullet", "Alavanquei a equipe", "Liderei a equipe"],
  [
    "cv.pt.density.vocabulary",
    "pt-BR",
    "bullet",
    "Enderecei a dívida técnica",
    "Mudei de endereço",
  ],
  [
    "cv.pt.density.nominalization",
    "pt-BR",
    "bullet",
    "A implementação de filas",
    "Implantei filas",
  ],
  ["cv.en.self-praise.passionate", "en", "summary", "Passionate about data", "Built data tools"],
  ["cv.en.self-praise.adjectives", "en", "summary", "Results-driven engineer", "Engineer"],
  ["cv.en.cliche.challenges", "en", "summary", "Seeking new challenges", "Seeking latency wins"],
  ["cv.en.opener.i-am", "en", "summary", "I am a backend engineer", "Backend engineer"],
  [
    "cv.en.weak-verb",
    "en",
    "bullet",
    "Responsible for the billing service",
    "Owned the billing service",
  ],
  ["cv.en.sincerity", "en", "summary", "Honestly, I love data", "I love data"],
  ["cv.en.neg-parallel", "en", "summary", "Not just code, but product", "Code and product"],
  ["cv.en.phrases", "en", "summary", "A testament to teamwork", "Teamwork"],
  ["cv.en.density.vocabulary", "en", "bullet", "Leveraged queues", "Used queues"],
  [
    "cv.en.density.trailing-participle",
    "en",
    "bullet",
    "Migrated queues, ensuring uptime",
    "Migrated queues",
  ],
  [
    "cv.en.density.nominalization",
    "en",
    "bullet",
    "The implementation of queues",
    "Implemented queues",
  ],
];

describe("cv-banned-phrases@1.0.0", () => {
  it("covers every entry with a positive and a negative case", () => {
    expect([...new Set(CASES.map(([id]) => id))].sort()).toEqual(
      CV_BANNED_PHRASES.entries.map((e) => e.id).sort(),
    );
  });

  for (const [entryId, language, block, hit, miss] of CASES) {
    it(`${entryId}: hits "${hit}", misses "${miss}"`, () => {
      const ids = (text: string) => lintText("seg-1", text, language, block).map((f) => f.entryId);
      expect(ids(hit)).toContain(entryId);
      expect(ids(miss)).not.toContain(entryId);
    });
  }

  it("serializes to the JSON format of humanizer-cv-rules.md §4.1", () => {
    const json = JSON.parse(JSON.stringify(CV_BANNED_PHRASES)) as typeof CV_BANNED_PHRASES;
    expect(json).toMatchObject({ id: "cv-banned-phrases", version: "1.0.0" });
    expect(CV_LINT_RULES_VERSION).toBe("cv-banned-phrases@1.0.0");
    for (const entry of json.entries) {
      expect(() => new RegExp(entry.pattern, entry.flags)).not.toThrow();
    }
  });
});

function cvWith(bullets: string[], summary = "Backend engineer."): TailoredCvContent {
  return {
    language: "en",
    summary: { segments: [segment("seg-0", summary, "rewritten", ["summary"])] },
    experiences: [
      {
        cvExperienceId: "exp-1",
        bullets: {
          segments: bullets.map((text, index) =>
            segment(`seg-${index + 1}`, text, "rewritten", ["exp-1"]),
          ),
        },
        skills: { segments: [] },
      },
    ],
    skills: { technical: { segments: [] }, behavioral: { segments: [] } },
    educationIds: [],
    certificationIds: [],
    languageIds: [],
  };
}

describe("lintTailoredCv (density, em dash, job echo)", () => {
  it("passes a clean CV", () => {
    expect(
      lintTailoredCv(cvWith(["Migrated 40 services to ECS."]), { language: "en" }),
    ).toMatchObject({
      passed: true,
      rejectRuleIds: [],
    });
  });

  it("rejects a single-hit entry", () => {
    const result = lintTailoredCv(cvWith(["Passionate about queues."]), { language: "en" });
    expect(result.rejectRuleIds).toEqual(["cv.en.self-praise.passionate"]);
  });

  it("flags 2 density markers and rejects 3 in one segment", () => {
    const two = lintTailoredCv(cvWith(["Leveraged queues to streamline billing."]), {
      language: "en",
    });
    expect(two.passed).toBe(true);
    expect(two.flagRuleIds).toContain("cv.density.flag");
    const three = lintTailoredCv(cvWith(["Leveraged queues to streamline and elevate billing."]), {
      language: "en",
    });
    expect(three.rejectRuleIds).toEqual(["cv.density.reject"]);
  });

  it("flags em dashes in bullets and more than one in the summary", () => {
    const result = lintTailoredCv(cvWith(["Migrated queues — fast."], "A — b — c."), {
      language: "en",
    });
    expect(result.flagRuleIds).toEqual(
      expect.arrayContaining(["cv.any.em-dash.bullet", "cv.any.em-dash.summary"]),
    );
  });

  it("counts 4+ words copied from the posting and flags repeated echoes", () => {
    const jobText = "own the billing platform end to end with strong testing culture";
    const result = lintTailoredCv(
      cvWith([
        "I own the billing platform today.",
        "Will own the billing platform end to end.",
        "Shipped features with strong testing culture.",
      ]),
      { language: "en", jobText },
    );
    expect(result.findings.filter((f) => f.entryId === "cv.job-echo")).toHaveLength(3);
    expect(result.flagRuleIds).toContain("cv.job-echo.repeated");
  });
});
