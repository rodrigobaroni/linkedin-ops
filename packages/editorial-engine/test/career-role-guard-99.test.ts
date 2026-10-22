/**
 * Issue #99 (Pena, cv-tailor-1.1.0.md §3 and §6.11.1; QA of PR #98): the role guard across clauses, a role used
 * as a label without an introducer, and `go-to`.
 */
import type { TailoredCvContent } from "@linkedin-ops/contracts";
import { describe, expect, it } from "vitest";
import { inventedRoleLabels, inventedRoleTitles } from "../src/career/entities.js";
import {
  listSegments,
  parseCvHumanizeResponse,
  parseCvTailorResponse,
  resolveTargetLanguage,
} from "../src/index.js";
import { baseCv, job, tailoringOutput } from "./fixtures/career.js";

describe("role lists end at a new clause (issue #99, QA of PR #98)", () => {
  it.each([
    ["Atuei como engenheira de software e apoiei o PO na priorização.", ["Engenheira de software"]],
    ["Worked as a software engineer and supported the PM on pricing.", ["Software Engineer"]],
    [
      "Atuei como engenheira de software e conduzi a migração com o PO.",
      ["Engenheira de software"],
    ],
    ["Worked as a software engineer and led the PM guild.", ["Software Engineer"]],
    ["Atuei como engenheira de software e cuidei do backlog do PO.", ["Engenheira de software"]],
  ])("positive: '%s'", (text, titles) => {
    expect(inventedRoleTitles(text, titles)).toEqual([]);
  });

  it.each([
    ["Atuei como engenheira e arquiteta de soluções.", ["Engenheira"], "arquiteta"],
    [
      "Atuei como engenheira de software e a tech lead do time.",
      ["Engenheira de software"],
      "tech lead",
    ],
    ["Worked as an engineer and the tech lead of payments.", ["Engineer"], "tech lead"],
    ["Worked as an engineer and senior product manager.", ["Engineer"], "product manager"],
    ["Atuei como engenheira e, mais tarde, tech lead do time.", ["Engenheira"], "tech lead"],
    ["Worked as an engineer and product owner of the billing team.", ["Engineer"], "product owner"],
  ])("negative (lists still caught): '%s'", (text, titles, role) => {
    expect(inventedRoleTitles(text, titles).some((found) => found.includes(role))).toBe(true);
  });

  it("accepted false positive, fails closed (Maestro D3): 'Fui responsável pelo roadmap e o PM aprovou.'", () => {
    expect(
      inventedRoleTitles("Fui responsável pelo roadmap e o PM aprovou.", [
        "Engenheira de software",
      ]),
    ).not.toEqual([]);
  });
});

describe("go-to is not a role (issue #99, Pena §6.11.1)", () => {
  it("positive: 'Served as the go-to contact for Airflow.'", () => {
    expect(
      inventedRoleTitles("Served as the go-to contact for Airflow.", ["Data Engineer"]),
    ).toEqual([]);
  });
});

describe("inventedRoleLabels: a role as a label without an introducer (issue #99, Pena §3)", () => {
  const pt = ["Engenheiro de Dados Sênior"];
  it.each([
    ["Tech lead de dados com foco em pagamentos.", pt, "tech lead de dados"],
    [
      "Staff data engineer focused on payments platforms.",
      ["Software Engineer"],
      "staff data engineer",
    ],
    ["Senior data engineer with eight years in payments.", pt, "data engineer"],
    [
      "Engenheira de dados, com foco em plataformas.",
      ["Engenheira de Software"],
      "engenheira de dados",
    ],
    ["SRE com foco em confiabilidade.", ["Engenheira de Software"], "sre"],
    ["Product manager for payments platforms.", ["Software Engineer"], "product manager"],
    [
      "Atuo com dados há anos. Tech lead de plataforma com foco em custo.",
      pt,
      "tech lead de plataforma",
    ],
    ["Líder técnica de dados com foco em pagamentos.", pt, "lider tecnica de dados"],
    ["Desenvolvedora fullstack com foco em pagamentos.", pt, "desenvolvedora fullstack"],
  ])("negative: '%s' with titles %j names '%s'", (text, titles, label) => {
    expect(inventedRoleLabels(text, titles).some((found) => found.includes(label))).toBe(true);
  });

  it.each([
    ["Engenheiro de dados sênior com foco em plataforma.", pt],
    ["Engenharia de dados em plataformas de pagamento.", pt],
    ["Liderei a migração dos pipelines de cobrança.", pt],
    ["Led the billing pipeline migration.", ["Software Engineer"]],
    ["Data engineering for payments platforms.", ["Software Engineer"]],
    ["Lead time de entrega caiu com a migração.", pt],
    ["Manager approval flows were automated.", ["Software Engineer"]],
    ["Product manager for payments platforms.", ["Product Manager"]],
    ["Mantive os pipelines do time de cobrança.", pt],
  ])("positive: '%s' with titles %j", (text, titles) => {
    expect(inventedRoleLabels(text, titles)).toEqual([]);
  });
});

describe("cv.tailor and the humanizer apply the label guard (issue #99)", () => {
  const target = resolveTargetLanguage("en");

  it("canary: a rewritten summary that opens with a role label is rejected", () => {
    const output = tailoringOutput();
    const summary = output.tailoredCv.summary.segments[0];
    if (summary) summary.text = "Senior backend engineer with 8 years in payment systems.";
    const result = parseCvTailorResponse(output, { base: baseCv, job, target });
    expect(result.ok ? [] : result.error.issues).toContain(
      "seg-1: hard limit, invented role label",
    );
  });

  it("canary: an added bullet that opens with a role label is rejected", () => {
    const output = tailoringOutput();
    const added = output.tailoredCv.experiences[0]?.bullets.segments[1];
    if (added) added.text = "Tech lead de eventos com Kafka.";
    const result = parseCvTailorResponse(output, { base: baseCv, job, target });
    expect(result.ok ? [] : result.error.issues).toContain(
      "seg-3: hard limit, invented role label",
    );
  });

  it("positive: the base summary kept as an unchanged original passes", () => {
    const output = tailoringOutput();
    const summary = output.tailoredCv.summary.segments[0];
    if (summary) {
      summary.text = "Engenheira backend com 8 anos em sistemas de pagamento.";
      summary.provenance = "original";
    }
    const result = parseCvTailorResponse(output, {
      base: baseCv,
      job,
      target: resolveTargetLanguage("pt-BR"),
    });
    expect(result.ok ? [] : result.error.issues).not.toContain(
      "seg-1: hard limit, invented role label",
    );
  });

  it("canary: the humanizer may not turn a summary into a role label", () => {
    const parsed = parseCvTailorResponse(tailoringOutput(), { base: baseCv, job, target });
    if (!parsed.ok) throw new Error(parsed.error.issues.join());
    const cv: TailoredCvContent = parsed.value.cv;
    const output = {
      schemaVersion: "1.0",
      injectionSuspected: false,
      injectionEvidence: null,
      segments: listSegments(cv).map(({ segment }) =>
        segment.segmentId === "seg-1"
          ? {
              segmentId: "seg-1",
              text: "Staff backend engineer focused on payment systems over 8 years.",
              changed: true,
              changeReason: "Ajuste de estilo.",
            }
          : {
              segmentId: segment.segmentId,
              text: segment.text,
              changed: false,
              changeReason: null,
            },
      ),
    };
    const result = parseCvHumanizeResponse(output, { before: cv, base: baseCv });
    expect(result.ok && result.value.revertedSegmentIds).toEqual(["seg-1"]);
  });
});

describe("label guard: leading articles and adjectives (QA of #109, Pena §6.12.1)", () => {
  const PT = ["Engenheiro de Dados Sênior"];
  const EN = ["Senior Software Engineer"];
  it.each([
    // probe/labels-bypass.mjs
    ["Experienced data engineer with 8 years in payments.", EN],
    ["Uma engenheira de dados com foco em pagamentos.", PT],
    ["A tech lead focused on payments.", EN],
    ["Um tech lead de dados com foco em custo.", PT],
    ["Seasoned product manager for fintechs.", EN],
    ["Experiente tech lead de dados com foco em custo.", PT],
    ["Results-driven data scientist with Python.", EN],
    ["An engineering manager with a data background.", EN],
    ["Hands-on staff engineer for platforms.", EN],
    ["Accomplished data architect with cloud focus.", EN],
    // QA of #109
    ["Proven engineering manager with a data background.", EN],
    ["The tech lead behind the billing migration.", EN],
    ["Hands-on tech lead for payments platforms.", EN],
    ["Head of data platform at a fintech.", EN],
    ["VP of engineering for payments.", EN],
    ["Tech lead e arquiteta de dados com foco em custo.", PT],
    ["Tech lead que liderou a migração de cobrança.", PT],
    ["Data engineer who builds reliable pipelines.", EN],
    ["Tech Lead — pagamentos e plataforma.", PT],
  ])("negative: '%s'", (text, titles) => {
    expect(inventedRoleLabels(text, titles)).not.toEqual([]);
  });

  it.each([
    "Lead time caiu pela metade.",
    "Developer experience is a recurring focus.",
    "PM e design definiram o escopo comigo.",
    "Engenharia de dados em plataformas de pagamento.",
    "Led the data engineering guild for two years.",
    "Hired a data engineer with Kafka experience.",
    "Supported the PM with pricing analyses.",
    "Partnered with the engineering manager for the billing roadmap.",
    "Mentored data engineers on testing.",
    "The migration cut costs with durable queues.",
  ])("positive: '%s'", (text) => {
    expect(inventedRoleLabels(text, ["Senior Software Engineer"])).toEqual([]);
  });

  it("positive: the base title with an article or an adjective is still covered", () => {
    expect(
      inventedRoleLabels("Um engenheiro de dados sênior com foco em plataforma.", [
        "Engenheiro de Dados Sênior",
      ]),
    ).toEqual([]);
  });
});

describe("list continuation: 'e staff da plataforma' (QA of #109)", () => {
  it("negative: a staff role listed after another", () => {
    expect(
      inventedRoleTitles("Atuei como engenheira e staff da plataforma.", ["Engenheira"]),
    ).not.toEqual([]);
  });
});
