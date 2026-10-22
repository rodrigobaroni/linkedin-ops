import { describe, expect, it } from "vitest";
import {
  listSegments,
  parseCvHumanizeResponse,
  parseCvTailorResponse,
  resolveTargetLanguage,
} from "../src/index.js";
import type { TailoredCvContent } from "@linkedin-ops/contracts";
import { baseCv, job, tailoringOutput } from "./fixtures/career.js";

function before(): TailoredCvContent {
  const result = parseCvTailorResponse(tailoringOutput(), {
    base: baseCv,
    job,
    target: resolveTargetLanguage("en"),
  });
  if (!result.ok) throw new Error(result.error.issues.join());
  return result.value.cv;
}

/** Humanizer output echoing every segment, with `changes` applied. */
function output(cv: TailoredCvContent, changes: Record<string, string>) {
  return {
    schemaVersion: "1.0",
    injectionSuspected: false,
    injectionEvidence: null,
    segments: listSegments(cv).map(({ segment }) => {
      const text = changes[segment.segmentId];
      return text === undefined
        ? { segmentId: segment.segmentId, text: segment.text, changed: false, changeReason: null }
        : { segmentId: segment.segmentId, text, changed: true, changeReason: "Ajuste de estilo." };
    }),
  };
}

function textOf(cv: TailoredCvContent, segmentId: string) {
  return listSegments(cv).find(({ segment }) => segment.segmentId === segmentId)?.segment;
}

describe("parseCvHumanizeResponse (humanizer-cv-rules.md §3.1)", () => {
  it("applies a clean rewrite and keeps provenance", () => {
    const cv = before();
    const result = parseCvHumanizeResponse(
      output(cv, {
        "seg-2": "Led the billing service move to durable queues, cutting incidents by 40%.",
      }),
      { before: cv, base: baseCv },
    );
    expect(result.ok && result.value.revertedSegmentIds).toEqual([]);
    expect(result.ok && textOf(result.value.cv, "seg-2")).toMatchObject({
      provenance: "rewritten",
    });
  });

  it("reverts a segment whose numbers changed", () => {
    const cv = before();
    const result = parseCvHumanizeResponse(
      output(cv, {
        "seg-2": "Led the billing migration to durable queues, cutting incidents by 45%.",
      }),
      { before: cv, base: baseCv },
    );
    expect(result.ok && result.value.revertedSegmentIds).toEqual(["seg-2"]);
    expect(result.ok && textOf(result.value.cv, "seg-2")?.text).toContain("40%");
  });

  it("reverts a segment that gained an entity", () => {
    const cv = before();
    const result = parseCvHumanizeResponse(
      output(cv, { "seg-3": "Evaluated Kafka and Kubernetes for event streaming." }),
      { before: cv, base: baseCv },
    );
    expect(result.ok && result.value.revertedSegmentIds).toEqual(["seg-3"]);
  });

  it("reverts a segment that gained a lowercase credential (Sentinela, PR #91)", () => {
    const cv = before();
    const result = parseCvHumanizeResponse(
      output(cv, { "seg-3": "Evaluated Kafka associate tooling for event streaming." }),
      { before: cv, base: baseCv },
    );
    expect(result.ok && result.value.revertedSegmentIds).toEqual(["seg-3"]);
  });

  it("reverts a segment that gained a lint marker (over-correction guard)", () => {
    const cv = before();
    const result = parseCvHumanizeResponse(
      output(cv, { "seg-3": "Passionate about evaluating Kafka for event streaming." }),
      { before: cv, base: baseCv },
    );
    expect(result.ok && result.value.revertedSegmentIds).toEqual(["seg-3"]);
  });

  it("promotes a changed `original` to `rewritten` and never demotes `added`", () => {
    const cv = before();
    const result = parseCvHumanizeResponse(
      output(cv, {
        "seg-4": "PostgreSQL (production)",
        "seg-3": "Evaluated Kafka for streaming events.",
      }),
      { before: cv, base: baseCv },
    );
    expect(result.ok && textOf(result.value.cv, "seg-4")?.provenance).toBe("rewritten");
    expect(result.ok && textOf(result.value.cv, "seg-3")?.provenance).toBe("added");
  });

  it("ignores text of segments marked unchanged", () => {
    const cv = before();
    const raw = output(cv, {});
    raw.segments[0] = { ...raw.segments[0]!, text: "Something else entirely." };
    const result = parseCvHumanizeResponse(raw, { before: cv, base: baseCv });
    expect(result.ok && result.value.cv).toEqual(cv);
  });

  it("rejects the whole output when segments are added, removed or reordered", () => {
    const cv = before();
    const raw = output(cv, {});
    raw.segments.reverse();
    const result = parseCvHumanizeResponse(raw, { before: cv, base: baseCv });
    expect(!result.ok && result.error.code).toBe("SEMANTIC_INVALID");
  });
});

describe("the humanizer never turns a credential into a title (Sentinela S-1, PR #91)", () => {
  const base = {
    ...baseCv,
    certifications: [
      { id: "cert-1", name: "Google Professional Data Engineer", issuer: null, date: null },
    ],
  };
  /** The tailored CV against `base`, with the rewritten bullet (seg-2) set to `bullet`. */
  function beforeWith(bullet: string): TailoredCvContent {
    const raw = tailoringOutput();
    const seg = raw.tailoredCv.experiences[0]?.bullets.segments[0];
    if (seg) seg.text = bullet;
    raw.tailoredCv.certifications = [{ cvCertificationId: "cert-1", order: 1 }];
    const result = parseCvTailorResponse(raw, { base, job, target: resolveTargetLanguage("en") });
    if (!result.ok) throw new Error(result.error.issues.join());
    return result.value.cv;
  }

  it("canary: 'atuei com pipelines' → 'atuei como data engineer' is reverted", () => {
    const cv = beforeWith("Atuei com pipelines de cobrança.");
    const result = parseCvHumanizeResponse(
      output(cv, { "seg-2": "Atuei como data engineer de cobrança." }),
      { before: cv, base },
    );
    expect(result.ok && result.value.revertedSegmentIds).toEqual(["seg-2"]);
    expect(result.ok && textOf(result.value.cv, "seg-2")?.text).toBe(
      "Atuei com pipelines de cobrança.",
    );
  });

  it("a credential that gains a marker-less shortening is reverted too", () => {
    const cv = beforeWith("Atuei com pipelines de cobrança.");
    const result = parseCvHumanizeResponse(
      output(cv, { "seg-2": "Atuei com pipelines de cobrança como professional data engineer." }),
      { before: cv, base },
    );
    expect(result.ok && result.value.revertedSegmentIds).toEqual(["seg-2"]);
  });

  it("canary: a role introducer before the base credential is reverted", () => {
    const cv = beforeWith("Atuei com pipelines de cobrança.");
    const result = parseCvHumanizeResponse(
      output(cv, {
        "seg-2": "Atuei como Google Professional Data Engineer nos pipelines de cobrança.",
      }),
      { before: cv, base },
    );
    expect(result.ok && result.value.revertedSegmentIds).toEqual(["seg-2"]);
  });

  it("a clean rewrite with the same base still applies", () => {
    const cv = beforeWith("Atuei com pipelines de cobrança.");
    const result = parseCvHumanizeResponse(
      output(cv, { "seg-2": "Atuei nos pipelines de cobrança." }),
      { before: cv, base },
    );
    expect(result.ok && result.value.revertedSegmentIds).toEqual([]);
  });
});

describe("the humanizer never introduces an invented title (issue #93, Pena §6.10.2)", () => {
  /** The tailored CV against the fixture base, with the rewritten bullet (seg-2) set to `bullet`. */
  function beforeWith(bullet: string): TailoredCvContent {
    const raw = tailoringOutput();
    const seg = raw.tailoredCv.experiences[0]?.bullets.segments[0];
    if (seg) seg.text = bullet;
    const result = parseCvTailorResponse(raw, {
      base: baseCv,
      job,
      target: resolveTargetLanguage("en"),
    });
    if (!result.ok) throw new Error(result.error.issues.join());
    return result.value.cv;
  }

  it.each([
    "Atuei como product manager nos pipelines de cobrança.",
    "Atuei como tech lead nos pipelines de cobrança.",
    "Worked as an engineering manager on the billing pipelines.",
  ])("canary: 'Atuei com pipelines…' → '%s' is reverted", (text) => {
    const cv = beforeWith("Atuei com pipelines de cobrança.");
    const result = parseCvHumanizeResponse(output(cv, { "seg-2": text }), {
      before: cv,
      base: baseCv,
    });
    expect(result.ok && result.value.revertedSegmentIds).toEqual(["seg-2"]);
    expect(result.ok && textOf(result.value.cv, "seg-2")?.text).toBe(
      "Atuei com pipelines de cobrança.",
    );
  });

  it("positive: the base CV's title, or a phrase without a role noun, applies", () => {
    const cv = beforeWith("Atuei com pipelines de cobrança.");
    const result = parseCvHumanizeResponse(
      output(cv, {
        "seg-2": "Atuei como engenheira de software nos pipelines de cobrança.",
        "seg-3": "Evaluated Kafka for event streaming as part of the team.",
      }),
      { before: cv, base: baseCv },
    );
    expect(result.ok && result.value.revertedSegmentIds).toEqual([]);
  });
});
