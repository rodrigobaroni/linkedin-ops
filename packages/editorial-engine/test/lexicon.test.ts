import type { JobPostingExtracted } from "@linkedin-ops/contracts";
import { describe, expect, it } from "vitest";
import {
  COMMON_OPENING_CONSTRUCTIONS,
  CV_COMPETENCY_LEXICON,
  createEntityGuard,
  parseCvTailorResponse,
  resolveTargetLanguage,
} from "../src/index.js";
import { baseCv, job, tailoringOutput } from "./fixtures/career.js";

const fold = (text: string) =>
  text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
const forms = CV_COMPETENCY_LEXICON.entries.flatMap((e) => [e.term, ...(e.aliases ?? [])]);

describe("cv-competency-lexicon@1.0.0 (Pena's pre-review §2, §4)", () => {
  it("never intersects denyTerms (clients, umbrella brands, bodies, credentials, ambiguous short forms)", () => {
    const deny = new Set(CV_COMPETENCY_LEXICON.denyTerms.flatMap((g) => g.terms).map(fold));
    expect(forms.map(fold).filter((form) => deny.has(form))).toEqual([]);
  });

  it("every entry has a category and an area (C7), and no spelling belongs to two entries", () => {
    for (const entry of CV_COMPETENCY_LEXICON.entries) {
      expect(entry.category, entry.term).toBeTruthy();
      expect(entry.areas.length, entry.term).toBeGreaterThan(0);
    }
    const folded = forms.map(fold);
    expect(folded.filter((form, i) => folded.indexOf(form) !== i)).toEqual([]);
  });

  it("holds no credential (C3, D4 hard limit 1)", () => {
    expect(
      forms.filter((form) =>
        /certif|foundation|practitioner|agilist|belt|\bpmp\b|\bcka\b/i.test(form),
      ),
    ).toEqual([]);
  });

  it("serializes to JSON", () => {
    const json = JSON.parse(JSON.stringify(CV_COMPETENCY_LEXICON)) as typeof CV_COMPETENCY_LEXICON;
    expect(json).toMatchObject({ id: "cv-competency-lexicon", version: "1.0.0" });
    expect(json.entries.length).toBe(CV_COMPETENCY_LEXICON.entries.length);
  });
});

/** A posting whose req-9 has the given text (technical, desirable). */
function postingWith(requirement: string): JobPostingExtracted {
  return {
    ...job,
    requirements: [
      ...job.requirements,
      {
        id: "req-9",
        kind: "desirable",
        category: "technical",
        text: requirement,
        evidence: requirement,
      },
    ],
  };
}

describe("closed-list entity guard (Maestro's decision; Sentinela PR #89)", () => {
  it("'Built a Nubank API integration with Kafka.' rejects Nubank and accepts API and Kafka", () => {
    const guard = createEntityGuard(baseCv, postingWith("Nubank API integration with Kafka"));
    expect(guard.newEntities("Built a Nubank API integration with Kafka.", ["req-9"])).toEqual([
      "nubank",
    ]);
  });

  it("the lowercase variant 'nubank' is rejected too", () => {
    const guard = createEntityGuard(baseCv, postingWith("Nubank API integration with Kafka"));
    expect(guard.newEntities("Built a nubank API integration with Kafka.", ["req-9"])).toEqual([
      "nubank",
    ]);
  });

  it("a legitimate lexicon term named by the cited requirement is accepted", () => {
    const guard = createEntityGuard(baseCv, postingWith("Kafka and Docker in production"));
    expect(guard.newEntities("Packaged the Kafka consumers with Docker.", ["req-9"])).toEqual([]);
  });

  it("a lexicon term not named by any cited requirement is rejected (the 'and' of the rule)", () => {
    const guard = createEntityGuard(baseCv, postingWith("Kafka and Docker in production"));
    expect(guard.newEntities("Packaged the Kafka consumers with Docker.", ["req-1"])).toEqual([
      "kafka",
      "docker",
    ]);
  });

  it("a lexicon term already in the base CV needs no requirement", () => {
    const guard = createEntityGuard(baseCv, job);
    expect(guard.newEntities("Tuned PostgreSQL indexes.", [])).toEqual([]);
  });
});

describe("denyTerms at runtime (Sentinela PR #89)", () => {
  it("requirement and output both lowercase: 'nubank' is rejected", () => {
    const guard = createEntityGuard(baseCv, postingWith("nubank API integration"));
    expect(
      guard.newEntities("Built a nubank API integration with Kafka.", ["req-9", "req-3"]),
    ).toEqual(["nubank"]);
  });

  it("a lowercase client of the deny list is rejected even when the posting never names it", () => {
    const guard = createEntityGuard(baseCv, postingWith("Kafka"));
    expect(guard.newEntities("Built payment flows for itaú with Kafka.", ["req-9"])).toEqual([
      "itau",
    ]);
    expect(guard.newEntities("Built payment flows for magazine luiza.", ["req-9"])).toEqual([
      "magazine luiza",
    ]);
  });

  it("names that are also common words are rejected only when written as names", () => {
    const guard = createEntityGuard(baseCv, postingWith("API and REST"));
    expect(guard.newEntities("Exposed the API via REST to the partner rede.", ["req-9"])).toEqual(
      [],
    );
    expect(guard.newEntities("Exposed the API to Rede via REST.", ["req-9"])).toEqual(["rede"]);
  });

  it("a deny-listed name that the base CV already has stays allowed", () => {
    const base = {
      ...baseCv,
      experiences: baseCv.experiences.map((e) => ({ ...e, company: "Itaú Unibanco" })),
    };
    const guard = createEntityGuard(base, postingWith("Kafka"));
    expect(guard.newEntities("Built Kafka pipelines at Itaú Unibanco.", ["req-9"])).toEqual([]);
  });
});

describe("a brand inside an allowed multi-word competence (Sentinela PR #89)", () => {
  const guard = (requirement: string) => createEntityGuard(baseCv, postingWith(requirement));

  it("'Google Cloud' passes when cited; 'Google' alone fails", () => {
    const g = guard("Google Cloud data platform");
    expect(g.newEntities("Ran batch jobs on Google Cloud.", ["req-9"])).toEqual([]);
    expect(g.newEntities("Ran batch jobs at Google.", ["req-9"])).toEqual(["google"]);
  });

  it("'Amazon S3', 'Amazon Redshift', 'Oracle Database', 'SAP HANA' and 'OpenAI API' pass when cited", () => {
    const g = guard("Amazon S3, Amazon Redshift, Oracle Database, SAP HANA and the OpenAI API");
    for (const text of [
      "Stored raw events in Amazon S3.",
      "Loaded marts into Amazon Redshift.",
      "Tuned queries on Oracle Database.",
      "Modeled finance tables in SAP HANA.",
      "Called the OpenAI API for summaries.",
    ]) {
      expect(g.newEntities(text, ["req-9"]), text).toEqual([]);
    }
  });

  it("the same products fail when no cited requirement names them", () => {
    expect(guard("Kafka").newEntities("Stored raw events in Amazon S3.", ["req-9"])).toEqual([
      "amazon",
      "s3",
    ]);
  });

  it("'AWS Certified Solutions Architect' fails (credential deny phrase is not a lexicon phrase)", () => {
    const g = guard("AWS cloud architecture");
    expect(g.newEntities("Became an AWS Certified Solutions Architect.", ["req-9"])).toContain(
      "aws certified",
    );
  });
});

describe("every qualified form that contains a denied brand passes when cited (Pena §6.6 R1)", () => {
  const deny = CV_COMPETENCY_LEXICON.denyTerms.flatMap((g) => g.terms).map(fold);
  const words = (text: string) => fold(text).split(/\s+/);
  const containsDenied = (form: string) => {
    const tokens = words(form);
    return deny.some((term) => {
      const t = term.split(/\s+/);
      return tokens.some((_w, i) => t.every((word, k) => tokens[i + k] === word));
    });
  };
  const affected = forms.filter((form) => form.includes(" ") && containsDenied(form));

  it("covers the ~30 forms Pena listed (Amazon *, Google *, Microsoft *, Oracle *, SAP *, Delta Lake…)", () => {
    expect(affected.length).toBeGreaterThanOrEqual(25);
    for (const expected of [
      "Amazon S3",
      "Google Analytics",
      "Delta Lake",
      "Spring Boot",
      "SAP HANA",
      "Neon Postgres",
      "HashiCorp Vault",
      "Microsoft Fabric",
      "OpenAI API",
      "Salesforce CRM",
    ]) {
      expect(affected).toContain(expected);
    }
  });

  for (const form of affected) {
    it(`"${form}" passes when the cited requirement names it`, () => {
      const guard = createEntityGuard(baseCv, postingWith(`Experiência com ${form}`));
      expect(guard.newEntities(`Integrei dados com ${form}.`, ["req-9"])).toEqual([]);
    });
  }

  it("Pena's R1 table passes with the cited requirement", () => {
    for (const [form, text] of [
      ["Amazon S3", "Armazenei dados no Amazon S3."],
      ["Google Analytics", "Instrumentei eventos no Google Analytics."],
      ["Delta Lake", "Modelei tabelas em Delta Lake."],
      ["Spring Boot", "Desenvolvi serviços com Spring Boot."],
      ["Neon Postgres", "Migrei para Neon Postgres."],
      ["SAP HANA", "Integrei dados do SAP HANA."],
      ["HashiCorp Vault", "Guardei segredos no HashiCorp Vault."],
      ["Microsoft Fabric", "Montei relatórios no Microsoft Fabric."],
      ["OpenAI API", "Integrei a OpenAI API."],
      ["Salesforce CRM", "Integrei o Salesforce CRM."],
    ] as const) {
      const guard = createEntityGuard(baseCv, postingWith(`Experiência com ${form}`));
      expect(guard.newEntities(text, ["req-9"]), text).toEqual([]);
    }
  });

  it("one alone-brand case per deny group still fails", () => {
    const g = createEntityGuard(
      baseCv,
      postingWith("Experiência com Amazon S3, Delta Lake e Spring Boot"),
    );
    const cases: Array<[group: string, text: string, expected: string]> = [
      ["banks-fintechs", "Integrei pagamentos do Bradesco.", "bradesco"],
      ["retail", "Armazenei dados na Amazon.", "amazon"],
      ["telecom-industry-services", "Atendi a Petrobras.", "petrobras"],
      ["big-tech-umbrella", "Integrei dados do SAP.", "sap"],
      ["public-bodies-institutions", "Atendi o BACEN.", "bacen"],
      ["credentials", "Obtive a PMP.", "pmp"],
      ["common-word-names", "Voei pela Delta.", "delta"],
      ["ambiguous-short-forms", "Desenvolvi com Spring.", "spring"],
    ];
    for (const [group, text, expected] of cases) {
      expect(g.newEntities(text, ["req-9"]), group).toContain(expected);
    }
  });
});

describe("deny terms cited by the posting are its names in any spelling (Crivo, PR #89)", () => {
  /** Replaces req-3 (the Kafka requirement the added fixture segment cites). */
  function guardWithReq3(text: string) {
    return createEntityGuard(baseCv, {
      ...job,
      requirements: job.requirements.map((r) =>
        r.id === "req-3" ? { ...r, text, evidence: text } : r,
      ),
    });
  }

  it("Crivo's exact case: 'built integrations with Nubank API.' → ['nubank']", () => {
    const g = guardWithReq3("nubank API integration with Kafka");
    expect(g.newEntities("built integrations with Nubank API.", ["req-3"])).toEqual(["nubank"]);
  });

  it("regression: a capitalized-mode term cited lowercase by the posting, 'integrated with rede API.' → ['rede']", () => {
    const g = guardWithReq3("rede API integration");
    expect(g.newEntities("integrated with rede API.", ["req-3"])).toEqual(["rede"]);
  });

  it("R2 does not reopen it: a posting name opening the sentence is still rejected", () => {
    const g = guardWithReq3("rede API integration");
    expect(g.newEntities("Rede API integration shipped.", ["req-3"])).toEqual(["rede"]);
  });
});

describe("R2 exempts only verifiable common constructions at the opening (Sentinela PR #89)", () => {
  const g = () => createEntityGuard(baseCv, postingWith("Python"));

  it.each([
    ["Delta delivered Python pipelines.", "delta"],
    ["Rede delivered Python pipelines.", "rede"],
    ["Delta entregou pipelines Python.", "delta"],
    ["Rede entregou pipelines Python.", "rede"],
    ["Via shipped Python pipelines.", "via"],
    ["Meta adopted Python pipelines.", "meta"],
  ])("negative canary: %s is a made-up name at the opening", (text, expected) => {
    expect(g().newEntities(text, ["req-9"])).toEqual([expected]);
  });

  it.each([
    ["Meta em 2023, liderei projetos de dados.", "meta"],
    ["Delta para clientes, entreguei pipelines Python.", "delta"],
    ["Rede para varejo, liderei squads.", "rede"],
    ["Meta in 2023, I led data projects.", "meta"],
  ])("negative canary (generic preposition): %s names an employer", (text, expected) => {
    expect(g().newEntities(text, ["req-9"])).toContain(expected);
  });

  it("the closed table of constructions per term is pinned", () => {
    expect(COMMON_OPENING_CONSTRUCTIONS).toEqual({
      meta: { followers: ["de", "da", "do"], lexiconTerm: false },
      rede: { followers: ["de", "da", "do"], lexiconTerm: false },
      via: { followers: ["a", "o", "as", "os"], lexiconTerm: true },
    });
  });

  it("Delta has no opening exemption (removed: 'Delta of the…' is not high-confidence)", () => {
    expect(g().newEntities("Delta of the Python models measured.", ["req-9"])).toEqual(["delta"]);
  });

  it.each([
    "Via API REST, integrei os sistemas com Python.",
    "Via Python, automatizei relatórios.",
    "Via a API, integrei os sistemas com Python.",
    "Meta de latência cumprida com Python.",
    "Rede de pipelines em Python.",
  ])("positive: %s is a common construction", (text) => {
    const cited = createEntityGuard(baseCv, postingWith("Python, API e REST"));
    expect(cited.newEntities(text, ["req-9"])).toEqual([]);
  });
});

describe("capitalized deny terms never match at the opening of a sentence (Pena §6.6 R2)", () => {
  it("'Via…', 'Meta de vendas…' and 'Rede de pipelines…' pass; the same names mid-sentence fail", () => {
    const g = createEntityGuard(baseCv, postingWith("APIs REST e Python"));
    expect(g.newEntities("Via API REST, integrei os sistemas.", ["req-9"])).toEqual([]);
    expect(g.newEntities("Meta de latência cumprida com Python.", ["req-9"])).toEqual([]);
    expect(g.newEntities("Rede de pipelines em Python.", ["req-9"])).toEqual([]);
    expect(g.newEntities("Integrei pagamentos com a Rede.", ["req-9"])).toEqual(["rede"]);
  });

  it("any-case names are still rejected at the opening", () => {
    const g = createEntityGuard(baseCv, postingWith("Python"));
    expect(g.newEntities("Nubank pipelines in Python.", ["req-9"])).toEqual(["nubank"]);
  });
});

describe("opening verbs from Pena's tests are not names (§6.6 R3)", () => {
  it("Armazenei, Guardei, Montei, Provisionei open sentences", () => {
    const g = createEntityGuard(baseCv, postingWith("Python"));
    for (const text of [
      "Armazenei dados com Python.",
      "Guardei segredos com Python.",
      "Montei relatórios com Python.",
      "Provisionei ambientes com Python.",
    ]) {
      expect(g.newEntities(text, ["req-9"]), text).toEqual([]);
    }
  });
});

describe("Pena's evals (cv-competency-lexicon-review.md §7)", () => {
  const guard = (requirement: string) => createEntityGuard(baseCv, postingWith(requirement));

  it("Kafka pipelines pass with a cited requirement naming Kafka, fail without", () => {
    expect(guard("Kafka").newEntities("Construí pipelines em Kafka.", ["req-9"])).toEqual([]);
    expect(guard("Kafka").newEntities("Construí pipelines em Kafka.", ["req-1"])).toEqual([
      "kafka",
    ]);
  });

  it("Itaú via Pix is rejected (client name), Pix itself is a standard", () => {
    expect(
      guard("Pix payments").newEntities("Integrei pagamentos do Itaú via Pix.", ["req-9"]),
    ).toEqual(["itau"]);
  });

  it("the short form Neon is rejected; Next.js passes, Next does not", () => {
    expect(guard("Neon").newEntities("Migrei a base para Neon.", ["req-9"])).toEqual(["neon"]);
    expect(guard("Next.js").newEntities("Usei Next.js no front.", ["req-9"])).toEqual([]);
    expect(guard("Next.js").newEntities("Usei Next no front.", ["req-9"])).toEqual(["next"]);
  });

  it("Magalu from 'experiência com o ecossistema Magalu' is never released", () => {
    const g = guard("experiência com o ecossistema Magalu");
    expect(g.newEntities("Atuei no ecossistema Magalu.", ["req-9"])).toEqual(["magalu"]);
    expect(g.newEntities("Atuei no ecossistema magalu.", ["req-9"])).toEqual(["magalu"]);
  });

  describe("through the parser (credential and numbers)", () => {
    const target = resolveTargetLanguage("en");
    function parseWith(requirement: string, text: string) {
      const output = tailoringOutput();
      const seg = output.tailoredCv.experiences[0]?.bullets.segments[1];
      if (seg) {
        seg.text = text;
        seg.targetRequirementIds = ["req-9"];
      }
      output.matchAssessment.requirements.push({
        requirementId: "req-9",
        status: "missing",
        cvEvidence: [],
        rationale: "Não está no CV.",
      });
      return parseCvTailorResponse(output, { base: baseCv, job: postingWith(requirement), target });
    }

    it("'AWS Certified Data Engineer' is a credential (hard limit 1)", () => {
      const result = parseWith(
        "AWS data engineering",
        "Obtive a certificação AWS Certified Data Engineer.",
      );
      expect(!result.ok && result.error.issues).toContain("seg-3: hard limit, added credential");
    });

    it("'Adequei controles à ISO 27001' passes with a cited requirement: 27001 is part of the term", () => {
      expect(parseWith("ISO 27001 controls", "Adequei controles à ISO 27001.").ok).toBe(true);
    });

    it("'ISO 27001 Foundation' is a credential", () => {
      const result = parseWith("ISO 27001 controls", "Concluí a ISO 27001 Foundation.");
      expect(!result.ok && result.error.issues).toContain("seg-3: hard limit, added credential");
    });
  });
});
