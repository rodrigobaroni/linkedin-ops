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
    if (seg) seg.text = "TypeScript (Node.js)";
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
