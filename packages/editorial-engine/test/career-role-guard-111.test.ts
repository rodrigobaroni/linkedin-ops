/**
 * Issue #111 (Pena §6.12.2 follow-ups, QA residues of PR #109): closed postposed modifiers, opening
 * adjectives in the entity guard, more label followers, seniority apart from the title, `especialista` in both
 * guards, and the label excerpt as written.
 */
import { describe, expect, it } from "vitest";
import {
  createEntityGuard,
  inventedRoleLabelMatches,
  inventedRoleLabels,
  inventedRoleTitles,
  parseCvTailorResponse,
  resolveTargetLanguage,
  type TailorIssue,
} from "../src/index.js";
import { baseCv, job, tailoringOutput } from "./fixtures/career.js";

const PT = ["Engenheiro de Dados Sênior"];
const EN = ["Senior Software Engineer"];

describe("label guard: the postposed modifier is a closed list or a lexicon term (issue #111, item 1; Pena §6.13)", () => {
  it.each([
    ["Developer tooling at scale is my focus.", EN],
    ["Manager dashboards on Looker were rebuilt.", EN],
    ["Engineer onboarding at scale was redesigned.", EN],
    // QA of #121.
    ["Lead scoring with dbt and Looker.", EN],
    ["Lead generation for payments platforms.", EN],
    ["Product analytics leading to pricing changes.", EN],
  ])("positive: '%s'", (text, titles) => {
    expect(inventedRoleLabels(text, titles)).toEqual([]);
  });

  it.each([
    ["Desenvolvedora full-stack com foco em pagamentos.", PT, "desenvolvedora full stack"],
    ["Desenvolvedora fullstack com foco em pagamentos.", PT, "desenvolvedora fullstack"],
    ["Engenheira back-end com foco em pagamentos.", PT, "engenheira back end"],
    ["Engenheiro backend com 8 anos em pagamentos.", PT, "engenheiro backend"],
    ["Mobile developer, iOS engineer for fintechs.", EN, "mobile developer"],
    ["Analista BI com foco em varejo.", PT, "analista bi"],
    // Pena §6.13: a lexicon term as the modifier, `embedded`, seniority after the modifier.
    ["Desenvolvedor Python com 8 anos em pagamentos.", PT, "desenvolvedor python"],
    ["Desenvolvedora Java com foco em pagamentos.", PT, "desenvolvedora java"],
    ["Engenheiro Go com foco em sistemas distribuídos.", PT, "engenheiro go"],
    ["Engenheiro SAP com foco em finanças.", PT, "engenheiro sap"],
    ["Engineer Kotlin with 8 years in payments.", EN, "engineer kotlin"],
    ["Engenheira embedded com foco em IoT.", PT, "engenheira embedded"],
    ["Desenvolvedor PHP sênior com 8 anos em e-commerce.", PT, "desenvolvedor php senior"],
    // QA of #121: an acronym as the modifier, participles, `|`, `/` and `·` as pauses.
    ["Product manager B2B focused on payments.", EN, "product manager b2b"],
    ["Data scientist NLP focused on churn.", EN, "data scientist nlp"],
    ["Staff engineer Kotlin focused on payments.", EN, "staff engineer kotlin"],
    ["Data engineer AWS with 8 years in payments.", EN, "data engineer aws"],
    ["Data engineer specialized in payments.", EN, "data engineer"],
    ["Data engineer responsible for the billing pipelines.", EN, "data engineer"],
    ["Engenheira de dados especializada em pagamentos.", PT, "engenheira de dados"],
    ["Engenheira de dados voltada a pagamentos.", PT, "engenheira de dados"],
    ["Principal Engineer | Pagamentos e crédito.", PT, "principal engineer"],
    ["Principal Engineer / Pagamentos e crédito.", PT, "principal engineer"],
    ["Principal Engineer · Pagamentos e crédito.", PT, "principal engineer"],
  ])("negative: '%s' names '%s'", (text, titles, label) => {
    expect(inventedRoleLabels(text, titles)).toContain(label);
  });
});

describe("label guard: a base title covers the role before a lexicon or acronym modifier (Maestro, #121)", () => {
  it.each([
    ["Product manager API focused on payments.", ["Product Manager"]],
    ["Data engineer AWS with 8 years in payments.", ["Data Engineer"]],
    ["Desenvolvedor Python com 8 anos em pagamentos.", ["Desenvolvedor"]],
    ["Desenvolvedor PHP sênior com 8 anos em e-commerce.", ["Desenvolvedor Sênior"]],
    ["Engenheiro SAP com foco em finanças.", ["Engenheiro"]],
    ["Staff engineer Kotlin focused on payments.", ["Staff Engineer"]],
    ["Sr data engineer AWS with 8 years in payments.", ["Senior Data Engineer"]],
  ])("positive: '%s' with %j", (text, titles) => {
    expect(inventedRoleLabels(text, titles)).toEqual([]);
  });

  it.each([
    // Seniority after the modifier is still checked.
    [
      "Desenvolvedor PHP sênior com 8 anos em e-commerce.",
      ["Desenvolvedor"],
      "desenvolvedor php senior",
    ],
    // A closed-list modifier is part of the role.
    [
      "Desenvolvedora fullstack com foco em pagamentos.",
      ["Desenvolvedora"],
      "desenvolvedora fullstack",
    ],
    // A title that does not cover the role before the modifier.
    ["Product manager API focused on payments.", ["Software Engineer"], "product manager api"],
    ["Data engineer AWS with 8 years in payments.", ["Analytics Engineer"], "data engineer aws"],
    // A shortened base title does not cover the role before the modifier.
    ["Engenheiro Go com foco em pagamentos.", ["Engenheiro de Dados Sênior"], "engenheiro go"],
    ["Engineer Kotlin with 8 years in payments.", ["Senior Software Engineer"], "engineer kotlin"],
    [
      "Staff engineer Kotlin focused on payments.",
      ["Staff Software Engineer"],
      "staff engineer kotlin",
    ],
  ])("negative: '%s' with %j names '%s'", (text, titles, label) => {
    expect(inventedRoleLabels(text, titles)).toContain(label);
  });
});

describe("label guard: 'passionate' and gerunds follow a label (issue #111, item 3)", () => {
  it.each([
    ["engineering leader passionate about data platforms.", EN, "engineering leader"],
    ["Tech lead liderando squads de dados.", PT, "tech lead"],
    ["Tech lead construindo a plataforma de cobrança.", PT, "tech lead"],
    ["Data engineer building reliable pipelines.", EN, "data engineer"],
    ["Engineering manager leading two squads.", EN, "engineering manager"],
  ])("negative: '%s' names '%s'", (text, titles, label) => {
    expect(inventedRoleLabels(text, titles)).toContain(label);
  });

  it.each([
    "Developer tooling at scale is my focus.",
    "Lead time caiu pela metade.",
    "Developer experience is a recurring focus.",
  ])("positive: '%s'", (text) => {
    expect(inventedRoleLabels(text, EN)).toEqual([]);
  });
});

describe("coversRole: seniority may stand apart from the title (issue #111, item 4)", () => {
  it.each([
    ["Senior engineer with 8 years in payments.", EN],
    ["Engenheiro sênior com 8 anos em pagamentos.", PT],
    ["Senior software engineer with 8 years in payments.", EN],
    // "Sr"/"Jr" are "senior"/"junior" (QA of #121).
    ["Senior engineer with 8 years in payments.", ["Sr Software Engineer"]],
    ["Sr software engineer with 8 years in payments.", EN],
    ["Jr data engineer with 2 years in payments.", ["Junior Data Engineer"]],
  ])("label positive: '%s' with %j", (text, titles) => {
    expect(inventedRoleLabels(text, titles)).toEqual([]);
  });

  it.each([
    // Seniority the title does not have.
    ["Staff engineer with 8 years in payments.", EN, "staff engineer"],
    ["Senior engineer with 8 years in payments.", ["Software Engineer"], "senior engineer"],
    // Only seniority may be apart: a free subsequence would cover these.
    ["Product manager for payments platforms.", ["Product Marketing Manager"], "product manager"],
    [
      "Gerente de produto para meios de pagamento.",
      ["Gerente de Marketing de Produto"],
      "gerente de produto",
    ],
    // A translated title is still not the base title.
    ["Senior data engineer with 8 years in payments.", PT, "senior data engineer"],
  ])("label negative: '%s' with %j names '%s'", (text, titles, label) => {
    expect(inventedRoleLabels(text, titles)).toContain(label);
  });

  it("label positive: the base title followed by a participle", () => {
    expect(inventedRoleLabels("Engenheiro de dados especializado em pagamentos.", PT)).toEqual([]);
  });

  it("title positive: 'Atuei como engenheiro sênior' with 'Engenheiro de Dados Sênior'", () => {
    expect(inventedRoleTitles("Atuei como engenheiro sênior nos pipelines.", PT)).toEqual([]);
  });

  it.each([
    ["Atuei como engenheiro sênior nos pipelines.", ["Engenheiro de Dados"]],
    ["Worked as a product manager on pricing.", ["Product Marketing Manager"]],
    ["Worked as a staff engineer on billing.", EN],
  ])("title negative: '%s' with %j", (text, titles) => {
    expect(inventedRoleTitles(text, titles)).not.toEqual([]);
  });
});

describe("'especialista' fails closed in both guards (issue #111, item 5; Maestro's decision)", () => {
  it.each([
    "Especialista em Airflow e dbt.",
    "Especialista em engenharia de dados com foco em custo.",
  ])("label: '%s'", (text) => {
    expect(inventedRoleLabels(text, PT)).toEqual(["especialista"]);
  });

  it("label: 'Specialist in Airflow and dbt.'", () => {
    expect(inventedRoleLabels("Specialist in Airflow and dbt.", EN)).toEqual(["specialist"]);
  });

  it.each([
    ["Atuei como especialista em Python.", "especialista"],
    ["Worked as a specialist in Python.", "specialist"],
  ])("title: '%s'", (text, role) => {
    expect(inventedRoleTitles(text, PT)).toEqual([role]);
  });

  it("covered by a base title in both guards", () => {
    const titles = ["Especialista em Dados"];
    expect(inventedRoleLabels("Especialista em dados com foco em custo.", titles)).toEqual([]);
    expect(inventedRoleTitles("Atuei como especialista em dados.", titles)).toEqual([]);
  });
});

describe("label excerpt as written (issue #111, item 6)", () => {
  it.each([
    ["Hands-on staff engineer for platforms.", "handson staff engineer", "Hands-on staff engineer"],
    [
      "Results-driven data scientist with Python.",
      "results driven data scientist",
      "Results-driven data scientist",
    ],
    [
      "Experienced, pragmatic data engineer with 8 years in payments.",
      "experienced pragmatic data engineer",
      "Experienced, pragmatic data engineer",
    ],
    [
      "Líder técnica de dados com foco em pagamentos.",
      "lider tecnica de dados",
      "Líder técnica de dados",
    ],
    [
      "Uma engenheira de dados com foco em pagamentos.",
      "engenheira de dados",
      "engenheira de dados",
    ],
    ["Tech Lead — pagamentos e crédito.", "tech lead", "Tech Lead"],
    ["Tech-lead de dados com foco.", "tech lead de dados", "Tech-lead de dados"],
    [
      "Atuo com dados desde 2016. Arquiteto de dados com foco em custo.",
      "arquiteto de dados",
      "Arquiteto de dados",
    ],
  ])("'%s': label '%s', excerpt '%s'", (text, label, excerpt) => {
    expect(inventedRoleLabelMatches(text, EN)).toEqual([{ label, excerpt }]);
  });

  it("an invisible character: the label is found, the excerpt is no literal stretch of the output", () => {
    const matches = inventedRoleLabelMatches("Te​ch lead de dados com foco em custo.", PT);
    expect(matches.map((match) => match.label)).toContain("tech lead de dados");
  });

  it("cv.tailor feeds the excerpt back as written", () => {
    const output = tailoringOutput();
    const summary = output.tailoredCv.summary.segments[0];
    if (summary) summary.text = "Hands-on staff engineer with 8 years in payment systems.";
    const result = parseCvTailorResponse(output, {
      base: baseCv,
      job,
      target: resolveTargetLanguage("en"),
    });
    const feedback: readonly TailorIssue[] = result.ok ? [] : (result.error.feedback ?? []);
    expect(feedback).toContainEqual({
      code: "invented_role_label",
      where: "seg-1",
      excerpt: "Hands-on staff engineer",
    });
  });
});

describe("entity guard: a self-describing adjective opening a sentence (issue #111, item 2)", () => {
  const guard = createEntityGuard(baseCv, job);
  // Before a comma, a conjunction, another adjective or a role word (Pena §6.13).
  it.each([
    "Curious, pragmatic and hands-on with data contracts.",
    "Highly experienced in payment systems.",
    "Pragmatic engineer for payment systems.",
    "Results-driven and curious about payment systems.",
    "Curiosa e pragmática com qualidade de dados.",
    "Altamente focada em sistemas de pagamento.",
  ])("positive: '%s'", (text) => {
    expect(guard.newEntities(text, [])).toEqual([]);
  });

  it.each([
    // Elsewhere the word may be a name: fails closed.
    ["Pragmatic shipped the payment systems.", "pragmatic"],
    ["Pragmatic about payment systems.", "pragmatic"],
    ["Globex shipped the payment systems.", "globex"],
    ["Built the pipelines. Curious Labs funded the migration.", "labs"],
    ["Built pipelines with Pragmatic for payments.", "pragmatic"],
  ])("negative: '%s' names '%s'", (text, name) => {
    expect(guard.newEntities(text, [])).toContain(name);
  });
});
