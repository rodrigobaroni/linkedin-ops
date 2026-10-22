import type { CvStructured } from "@linkedin-ops/contracts";
import { describe, expect, it } from "vitest";
import {
  buildMatchReport,
  parseCvExtractResponse,
  parseCvTailorResponse,
  parseJobExtractResponse,
  resolveTargetLanguage,
  type ParsedCvTailoring,
} from "../src/index.js";
import {
  baseCv,
  cvExtractionOutput,
  job,
  jobExtractionOutput,
  postingText,
  tailoringOutput,
} from "./fixtures/career.js";

const target = resolveTargetLanguage("en");

function tailor(raw: unknown) {
  return parseCvTailorResponse(raw, { base: baseCv, job, target });
}

function tailored(raw: unknown): ParsedCvTailoring {
  const result = tailor(raw);
  if (!result.ok) throw new Error(result.error.issues.join("; "));
  return result.value;
}

function issuesOf(raw: unknown): string[] {
  const result = tailor(raw);
  if (result.ok) throw new Error("expected a failure");
  return result.error.issues;
}

describe("parseCvExtractResponse (cv-extract)", () => {
  it("normalizes ids by position", () => {
    const result = parseCvExtractResponse(cvExtractionOutput);
    expect(result.ok && result.value.cv).toEqual(baseCv);
  });

  it("flags not_a_cv documents", () => {
    const result = parseCvExtractResponse({
      ...cvExtractionOutput,
      parseWarnings: [{ field: "document", message: "not_a_cv" }],
    });
    expect(result.ok && result.value.notACv).toBe(true);
  });

  it("rejects an output outside the schema without echoing content", () => {
    const result = parseCvExtractResponse({ ...cvExtractionOutput, schemaVersion: "2.0" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("SCHEMA_INVALID");
      expect(result.error.issues.join()).not.toContain("Ana");
    }
  });
});

describe("parseJobExtractResponse (job-extract)", () => {
  it("keeps requirements whose evidence is in the posting", () => {
    const result = parseJobExtractResponse(jobExtractionOutput, { postingText });
    expect(result.ok && result.value.kind === "job" && result.value.job).toEqual(job);
  });

  it("drops requirements with invented evidence and counts them", () => {
    const output = structuredClone(jobExtractionOutput);
    output.requirements.push({
      id: "req-4",
      kind: "mandatory",
      category: "technical",
      text: "Rust",
      evidence: "10 years of Rust",
    });
    const result = parseJobExtractResponse(output, { postingText });
    expect(result.ok && result.value.kind === "job" && result.value.droppedRequirementCount).toBe(
      1,
    );
  });

  it("fails when no requirement has verifiable evidence", () => {
    const output = structuredClone(jobExtractionOutput);
    output.requirements = output.requirements.map((r) => ({ ...r, evidence: "not there" }));
    const result = parseJobExtractResponse(output, { postingText });
    expect(!result.ok && result.error.code).toBe("SEMANTIC_INVALID");
  });

  it("returns not_a_job for a login wall", () => {
    const result = parseJobExtractResponse(
      {
        ...jobExtractionOutput,
        isJobPosting: false,
        notAJobReason: "login wall",
        title: null,
        requirements: [],
        keywords: [],
      },
      { postingText: "Sign in to view" },
    );
    expect(result.ok && result.value.kind).toBe("not_a_job");
  });
});

describe("parseCvTailorResponse (cv-tailor)", () => {
  it("maps the output to content in display order", () => {
    const value = tailored(tailoringOutput());
    expect(value.cv.language).toBe("en");
    expect(value.cv.educationIds).toEqual(["edu-1"]);
    expect(value.requirements.map((r) => r.status)).toEqual(["partial", "met", "missing"]);
    expect(value.promotedSegmentIds).toEqual([]);
  });

  it("downgrades a requirement whose quote is not in the cited base item (no quote, no credit)", () => {
    const output = tailoringOutput();
    output.matchAssessment.requirements[2] = {
      requirementId: "req-3",
      status: "met",
      cvEvidence: [{ cvItemId: "exp-1-b-1", quote: "Kafka em produção" }],
      rationale: "Inventado.",
    };
    const req3 = tailored(output).requirements[2];
    expect(req3).toMatchObject({ status: "missing", evidenceRejected: true, cvEvidence: [] });
  });

  it("promotes an `original` segment whose text differs from its source to `rewritten`", () => {
    const output = tailoringOutput();
    const seg = output.tailoredCv.skills.technical.segments[0];
    if (seg) seg.text = "TypeScript language";
    const value = tailored(output);
    expect(value.promotedSegmentIds).toEqual(["seg-5"]);
    expect(value.cv.skills.technical.segments[0]?.provenance).toBe("rewritten");
  });

  it("rejects a dropped experience and an unknown education id", () => {
    const output = tailoringOutput();
    output.tailoredCv.experiences = [];
    output.tailoredCv.education = [{ cvEducationId: "edu-9", order: 1 }];
    const issues = issuesOf(output);
    expect(issues).toContain("experiences: missing exp-1");
    expect(issues).toContain("education: unknown edu-9");
  });

  it("rejects an unassessed or unknown requirement", () => {
    const output = tailoringOutput();
    output.matchAssessment.requirements[0] = {
      ...output.matchAssessment.requirements[0]!,
      requirementId: "req-9",
    };
    const issues = issuesOf(output);
    expect(issues).toContain("matchAssessment: unknown requirement req-9");
    expect(issues).toContain("matchAssessment: requirement req-1 not assessed");
  });

  it("rejects a target language other than the resolved one", () => {
    const output = { ...tailoringOutput(), targetLanguage: "pt-BR" as const };
    expect(issuesOf(output)).toContain("targetLanguage: expected en");
  });

  it("rejects a rewritten segment carrying a number absent from its sources (hidden addition)", () => {
    const output = tailoringOutput();
    const seg = output.tailoredCv.summary.segments[0];
    if (seg) seg.text = "Backend engineer with 12 years in payment systems.";
    expect(issuesOf(output)).toContain("seg-1: number not in cited base items");
  });

  describe("D4 hard limits (fixed rule, Rodrigo 2026-10-22)", () => {
    it("rejects an added segment with a number absent from the base CV", () => {
      const output = tailoringOutput();
      const seg = output.tailoredCv.experiences[0]?.bullets.segments[1];
      if (seg) seg.text = "Cut Kafka consumer lag by 35%.";
      expect(issuesOf(output)).toContain("seg-3: hard limit, added number");
    });

    it("accepts an added segment reusing a number that exists in the base CV", () => {
      const output = tailoringOutput();
      const seg = output.tailoredCv.experiences[0]?.bullets.segments[1];
      if (seg) seg.text = "Applied 8 years of payment experience to event streaming with Kafka.";
      expect(tailor(output).ok).toBe(true);
    });

    it("rejects an added credential (degree or certification)", () => {
      const output = tailoringOutput();
      const seg = output.tailoredCv.experiences[0]?.bullets.segments[1];
      if (seg) seg.text = "Confluent Certified Developer for Apache Kafka.";
      expect(issuesOf(output)).toContain("seg-3: hard limit, added credential");
    });

    describe("entity guard (Sentinela/Crivo PR #89)", () => {
      /** Replaces the added bullet (seg-3, targets req-3 Kafka) or the rewritten bullet (seg-2). */
      function withBullet(index: 0 | 1, text: string) {
        const output = tailoringOutput();
        const seg = output.tailoredCv.experiences[0]?.bullets.segments[index];
        if (seg) seg.text = text;
        return output;
      }
      const CANARIES: Array<[kind: string, text: string]> = [
        ["employer", "Built payment APIs while working at Google with Kafka."],
        ["job title", "Acted as Staff Engineer for the Kafka rollout."],
        ["date", "Led the Kafka rollout since March."],
        ["client", "Delivered the Kafka integration for Itaú."],
        ["project", "Led the Kafka rollout of project Phoenix."],
        ["Crivo repro", "Delivered Project Apollo for Nubank using Kafka."],
        ["name opening the sentence (Sentinela 2a)", "Nubank project used Kafka."],
        ["name opening the sentence (Crivo)", "Nubank delivered Kafka streaming."],
      ];
      for (const [kind, text] of CANARIES) {
        it(`rejects a new ${kind} in an added segment`, () => {
          expect(issuesOf(withBullet(1, text))).toContain("seg-3: hard limit, new entity");
        });
        it(`rejects a new ${kind} in a rewritten segment`, () => {
          expect(issuesOf(withBullet(0, text))).toContain("seg-2: hard limit, new entity");
        });
      }

      it("allows a competence term of the targeted technical requirement", () => {
        expect(tailor(withBullet(1, "Evaluated Kafka for event streaming.")).ok).toBe(true);
      });

      it("does not allow the same term when the segment does not target that requirement", () => {
        const output = withBullet(0, "Led the migration of the billing service to Kafka.");
        expect(issuesOf(output)).toContain("seg-2: hard limit, new entity");
      });

      it("never allows terms of non-competence requirements (experience, certification)", () => {
        const output = tailoringOutput();
        const extended = {
          ...job,
          requirements: [
            ...job.requirements,
            {
              id: "req-4",
              kind: "desirable" as const,
              category: "experience" as const,
              text: "Experience at Nubank",
              evidence: "Kafka is a plus",
            },
          ],
        };
        output.matchAssessment.requirements.push({
          requirementId: "req-4",
          status: "missing",
          cvEvidence: [],
          rationale: "Sem essa experiência.",
        });
        const seg = output.tailoredCv.experiences[0]?.bullets.segments[1];
        if (seg) {
          seg.text = "Worked with Nubank on event streaming.";
          seg.targetRequirementIds = ["req-4"];
        }
        const result = parseCvTailorResponse(output, { base: baseCv, job: extended, target });
        expect(!result.ok && result.error.issues).toContain("seg-3: hard limit, new entity");
      });

      describe("a cited requirement releases competence terms, never named entities (Sentinela 2b)", () => {
        function withRequirement(text: string, segmentText: string) {
          const output = tailoringOutput();
          const extended = {
            ...job,
            requirements: job.requirements.map((r) =>
              r.id === "req-3" ? { ...r, text, evidence: "Kafka is a plus" } : r,
            ),
          };
          const seg = output.tailoredCv.experiences[0]?.bullets.segments[1];
          if (seg) seg.text = segmentText;
          return parseCvTailorResponse(output, { base: baseCv, job: extended, target });
        }

        it("the client named in the requirement is not released", () => {
          const result = withRequirement(
            "Kafka streaming for client Nubank",
            "Built Kafka streaming for Nubank.",
          );
          expect(!result.ok && result.error.issues).toContain("seg-3: hard limit, new entity");
        });

        it("the project named in the requirement is not released", () => {
          const result = withRequirement(
            "Experience with Kafka on project Apollo",
            "Ran Kafka consumers for Apollo.",
          );
          expect(!result.ok && result.error.issues).toContain("seg-3: hard limit, new entity");
        });

        it("the employer named by the posting is not released", () => {
          const result = withRequirement(
            "Kafka at Fictional Corp scale",
            "Ran Kafka at Fictional Corp scale.",
          );
          expect(!result.ok && result.error.issues).toContain("seg-3: hard limit, new entity");
        });

        it("the technology of the same requirement still is", () => {
          const result = withRequirement(
            "Kafka streaming for client Nubank",
            "Built Kafka streaming pipelines.",
          );
          expect(result.ok).toBe(true);
        });
      });

      it("an opening action verb or a common word is not a name", () => {
        for (const text of [
          "Led the billing migration to durable queues.",
          "Evaluated Kafka for event streaming.",
          "Backend migration of the billing service.",
        ]) {
          expect(tailor(withBullet(1, text)).ok, text).toBe(true);
        }
      });

      it("accepts entities already in the base CV and translated base skills", () => {
        const output = withBullet(
          0,
          "Led the PostgreSQL billing migration at Empresa Fictícia S.A.",
        );
        expect(tailor(output).ok).toBe(true);
      });

      it("rejects an added skill that the cited requirement does not name", () => {
        const output = tailoringOutput();
        output.tailoredCv.skills.technical.segments.push({
          segmentId: "seg-9",
          text: "Kubernetes",
          provenance: "added",
          sourceCvItemIds: [],
          targetRequirementIds: ["req-3"],
          additionNote: "Competência coerente.",
        });
        expect(issuesOf(output)).toContain("seg-9: hard limit, new entity");
      });
    });

    it("never takes employer, title or dates from the model: the output has no such fields", () => {
      const output = tailoringOutput() as unknown as Record<string, Record<string, unknown[]>>;
      const experience = output.tailoredCv?.experiences?.[0] as Record<string, unknown>;
      experience.company = "Google";
      expect(tailor(output).ok).toBe(false);
    });
  });
});

describe("FALLBACK_LANGUAGE (fixed rule, Rodrigo 2026-10-22)", () => {
  it("keeps pt-BR and en postings in their language", () => {
    expect(resolveTargetLanguage("pt-BR")).toEqual({ language: "pt-BR", fallback: false });
    expect(resolveTargetLanguage("en")).toEqual({ language: "en", fallback: false });
  });

  it("writes the CV in English for any other language and warns in the report", () => {
    const fallback = resolveTargetLanguage("other");
    expect(fallback).toEqual({ language: "en", fallback: true });
    const value = parseCvTailorResponse(tailoringOutput(), {
      base: baseCv,
      job: { ...job, language: "other", languageDetected: "es" },
      target: fallback,
    });
    if (!value.ok) throw new Error(value.error.issues.join());
    const report = buildMatchReport({
      job: { ...job, language: "other", languageDetected: "es" },
      requirements: value.value.requirements,
      cv: value.value.cv,
      target: fallback,
      humanizer: {
        rulesVersion: "cv-banned-phrases@1.0.0",
        passed: true,
        regenerations: 0,
        failedRuleIds: [],
        revertedSegmentIds: [],
      },
      injectionSuspected: false,
      jobEcho: false,
    });
    expect(report.warnings).toEqual(["language_fallback"]);
    expect(report).toMatchObject({ jobLanguage: "es", cvLanguage: "en" });
  });
});

describe("buildMatchReport", () => {
  it("scores the base CV before additions and lists every added segment", () => {
    const value = tailored(tailoringOutput());
    const report = buildMatchReport({
      job,
      requirements: value.requirements,
      cv: value.cv,
      target,
      humanizer: {
        rulesVersion: "cv-banned-phrases@1.0.0",
        passed: true,
        regenerations: 0,
        failedRuleIds: [],
        revertedSegmentIds: [],
      },
      injectionSuspected: true,
      jobEcho: false,
    });
    // mandatory: (0.5 + 1) / 2 = 0.75 × 0.7; desirable: 0 × 0.3 → 52.5 → 53.
    expect(report.baseScore).toBe(53);
    expect(report.added).toEqual([
      {
        segmentId: "seg-3",
        section: "experience-bullets",
        cvExperienceId: "exp-1",
        text: "Evaluated Kafka for event streaming.",
        targetRequirementIds: ["req-3"],
        additionNote: "Aproxima a experiência do requisito.",
      },
    ]);
    expect(report.warnings).toEqual(["injection_suspected"]);
  });
});

describe("credentials in rewritten and changed original segments (Sentinela, PR #91)", () => {
  /** The base CV with its bullet (exp-1-b-1) and skill (exp-1-s-1) replaced. */
  function baseWith(bullet: string, skill = "PostgreSQL"): CvStructured {
    const [experience] = baseCv.experiences;
    return {
      ...baseCv,
      experiences: [
        {
          ...experience!,
          bullets: [{ id: "exp-1-b-1", text: bullet }],
          skills: [{ id: "exp-1-s-1", text: skill }],
        },
      ],
    };
  }
  /** seg-2 is the rewritten bullet (source exp-1-b-1); seg-4 the `original` skill (source exp-1-s-1). */
  function run(base: CvStructured, texts: { bullet?: string; skill?: string }) {
    const output = tailoringOutput();
    const bullet = output.tailoredCv.experiences[0]?.bullets.segments[0];
    const skill = output.tailoredCv.experiences[0]?.skills.segments[0];
    if (bullet && texts.bullet !== undefined) bullet.text = texts.bullet;
    if (skill && texts.skill !== undefined) skill.text = texts.skill;
    return parseCvTailorResponse(output, { base, job, target });
  }
  const issues = (result: ReturnType<typeof run>) => (result.ok ? [] : result.error.issues);

  it("negative: rewritten 'Trabalhei com Terraform associate.' from 'Trabalhei com Terraform.'", () => {
    const result = run(baseWith("Trabalhei com Terraform."), {
      bullet: "Trabalhei com Terraform associate.",
    });
    // The entity guard also rejects it (`Terraform Associate` is a credential deny term since 1.0.1).
    expect(issues(result)).toContain("seg-2: hard limit, credential not in cited base items");
  });

  it("negative: rewritten 'Trabalhei com Kafka associate.' (no deny term to catch it)", () => {
    const result = run(baseWith("Trabalhei com Kafka."), {
      bullet: "Trabalhei com Kafka associate.",
    });
    expect(issues(result)).toEqual(["seg-2: hard limit, credential not in cited base items"]);
  });

  it("negative: a changed original skill 'AWS solutions architect' from 'AWS'", () => {
    const result = run(baseWith("Trabalhei com Terraform.", "AWS"), {
      bullet: "Trabalhei com Terraform.",
      skill: "AWS solutions architect",
    });
    // `credentials-common-words` is any-case since this fix, so the entity guard rejects it too.
    expect(issues(result)).toEqual([
      "seg-4: hard limit, new entity",
      "seg-4: hard limit, credential not in cited base items",
    ]);
  });

  it("negative: rewritten lowercase 'certified Kubernetes administrator'", () => {
    const result = run(baseWith("Operei clusters Kubernetes."), {
      bullet: "Operei clusters Kubernetes como certified Kubernetes administrator.",
    });
    expect(issues(result)).toEqual(["seg-2: hard limit, credential not in cited base items"]);
  });

  it("negative: a different credential than the one in the source", () => {
    const result = run(baseWith("Atuei como AWS Certified Solutions Architect com Kubernetes."), {
      bullet: "Atuei como Certified Kubernetes com AWS.",
    });
    expect(issues(result)).toEqual(["seg-2: hard limit, credential not in cited base items"]);
  });

  it("positive: a rewritten segment keeping the certification already in its source passes", () => {
    const base = baseWith("Obtive a AWS Certified Solutions Architect em pagamentos.");
    expect(
      run(base, { bullet: "Concluí a AWS Certified Solutions Architect em pagamentos." }).ok,
    ).toBe(true);
    // Shortening it is still the same credential.
    expect(run(base, { bullet: "Obtive a AWS Certified em pagamentos." }).ok).toBe(true);
  });

  it("an unchanged original segment holding a credential passes", () => {
    const base = baseWith("Trabalhei com Terraform.", "Terraform Associate");
    expect(
      issues(run(base, { bullet: "Trabalhei com Terraform.", skill: "Terraform Associate" })),
    ).toEqual([]);
  });
});

describe("a credential never becomes an invented title (Sentinela S-1, PR #91)", () => {
  const ROLE = "seg-2: hard limit, title from a credential";
  /** The base CV with its bullet (exp-1-b-1), title and certifications replaced. */
  function baseWith(
    bullet: string,
    options: { title?: string; certifications?: string[] } = {},
  ): CvStructured {
    const [experience] = baseCv.experiences;
    return {
      ...baseCv,
      experiences: [
        {
          ...experience!,
          title: options.title ?? experience!.title,
          bullets: [{ id: "exp-1-b-1", text: bullet }],
        },
      ],
      certifications: (options.certifications ?? []).map((name, index) => ({
        id: `cert-${index + 1}`,
        name,
        issuer: null,
        date: null,
      })),
    };
  }
  /** seg-2 is the rewritten bullet (source exp-1-b-1), seg-3 the added bullet. */
  function run(base: CvStructured, texts: { bullet?: string; added?: string }) {
    const output = tailoringOutput();
    const [bullet, added] = output.tailoredCv.experiences[0]?.bullets.segments ?? [];
    if (bullet && texts.bullet !== undefined) bullet.text = texts.bullet;
    if (added && texts.added !== undefined) added.text = texts.added;
    output.tailoredCv.certifications = base.certifications.map((item, index) => ({
      cvCertificationId: item.id,
      order: index + 1,
    }));
    return parseCvTailorResponse(output, { base, job, target });
  }
  const issues = (result: ReturnType<typeof run>) => (result.ok ? [] : result.error.issues);

  it.each([
    ["Obtive a AWS Certified Solutions Architect.", "Atuei como Solutions Architect."],
    ["Obtive a Google Professional Data Engineer.", "Atuei como Data Engineer."],
    ["Obtive a Certified Kubernetes Administrator.", "Trabalhei como Kubernetes Administrator."],
    ["Obtive a Certified Kubernetes Administrator.", "Trabalhei como kubernetes administrator."],
  ])("negative: source %s, rewritten %s", (source, text) => {
    expect(issues(run(baseWith(source), { bullet: text }))).toContain(ROLE);
  });

  it("negative: the credential sits in another base item (a certification), not the cited one", () => {
    const base = baseWith("Trabalhei com pagamentos.", {
      certifications: ["Google Professional Data Engineer"],
    });
    expect(issues(run(base, { bullet: "Trabalhei com pagamentos como Data Engineer." }))).toContain(
      ROLE,
    );
    expect(issues(run(base, { added: "Atuei como Data Engineer com Kafka." }))).toContain(
      "seg-3: hard limit, title from a credential",
    );
  });

  it.each([
    [
      "Obtive a AWS Certified Solutions Architect.",
      "Atuei como AWS Certified Solutions Architect.",
    ],
    [
      "Obtive a AWS Certified Solutions Architect.",
      "Worked as an AWS Certified Solutions Architect.",
    ],
    [
      "Obtive a Google Professional Data Engineer.",
      "No papel de Google Professional Data Engineer, conduzi pipelines.",
    ],
  ])(
    "negative: a role introducer turns the credential into a title: source %s, rewritten %s",
    (source, text) => {
      expect(issues(run(baseWith(source), { bullet: text }))).toContain(ROLE);
    },
  );

  it("positive: a role introducer before a credential whose title the base CV already has", () => {
    const base = baseWith("Obtive a AWS Certified Solutions Architect.", {
      title: "Solutions Architect",
    });
    expect(issues(run(base, { bullet: "Atuei como AWS Certified Solutions Architect." }))).toEqual(
      [],
    );
    const pt = baseWith("Obtive a Google Professional Data Engineer.", {
      title: "Engenheiro de Dados",
    });
    expect(issues(run(pt, { bullet: "Atuei como Engenheiro de Dados." }))).toEqual([]);
  });

  it("positive: naming the credential without a role introducer passes", () => {
    const heading = "Certificação AWS Certified Solutions Architect.";
    expect(
      issues(
        run(baseWith(heading), {
          bullet: "Certificação AWS Certified Solutions Architect em pagamentos.",
        }),
      ),
    ).toEqual([]);
    const source = "Obtive a AWS Certified Solutions Architect.";
    expect(issues(run(baseWith(source), { bullet: source }))).toEqual([]);
  });

  it("positive: keeping the whole credential passes", () => {
    const source = "Obtive a AWS Certified Solutions Architect.";
    expect(issues(run(baseWith(source), { bullet: source }))).toEqual([]);
    expect(
      issues(run(baseWith(source), { bullet: "Concluí a AWS Certified Solutions Architect." })),
    ).toEqual([]);
  });

  it("negative: keeping the credential does not cover a separate title in the same text", () => {
    const source = "Obtive a AWS Certified Solutions Architect.";
    const text = "Obtive a AWS Certified Solutions Architect e atuei como Solutions Architect.";
    expect(issues(run(baseWith(source), { bullet: text }))).toContain(ROLE);
  });

  it("positive: shortening to 'AWS Certified' keeps the marker and passes", () => {
    const base = baseWith("Obtive a AWS Certified Solutions Architect.");
    expect(issues(run(base, { bullet: "Obtive a AWS Certified." }))).toEqual([]);
  });

  it("positive: a title the base CV already has as a title passes", () => {
    const base = baseWith("Obtive a AWS Certified Solutions Architect.", {
      title: "Solutions Architect",
    });
    expect(issues(run(base, { bullet: "Atuei como Solutions Architect." }))).toEqual([]);
  });

  it("a lowercase role word alone is not a title ('backend engineer' with a Data Engineer cert)", () => {
    const base = baseWith("Trabalhei com pagamentos.", {
      certifications: ["Google Professional Data Engineer"],
    });
    expect(
      issues(run(base, { bullet: "Trabalhei com pagamentos como backend engineer." })),
    ).toEqual([]);
  });
});
