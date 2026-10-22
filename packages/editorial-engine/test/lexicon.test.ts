import type { JobPostingExtracted } from "@linkedin-ops/contracts";
import { describe, expect, it } from "vitest";
import {
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
