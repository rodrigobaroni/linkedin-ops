import { describe, expect, it } from "vitest";
import { canonicalNumber, numericTokens, sameNumbers } from "../src/career/text.js";
import {
  listSegments,
  parseCvHumanizeResponse,
  parseCvTailorResponse,
  resolveTargetLanguage,
} from "../src/index.js";
import { baseCv, job, tailoringOutput } from "./fixtures/career.js";

describe("numeric tokens (Crivo PR89-2)", () => {
  it.each([
    ["1.5", "1.5"],
    ["1,5", "1.5"],
    ["15", "15"],
    ["1.500", "1500"],
    ["1,500", "1500"],
    ["1.500,00", "1500"],
    ["1,500.50", "1500.5"],
    ["1.234.567", "1234567"],
    ["0.125", "0.125"],
    ["2024", "2024"],
    ["007", "7"],
  ])("canonical value of %s is %s", (token, value) => {
    expect(canonicalNumber(token)).toBe(value);
  });

  it("keeps distinct values distinct, including money and percentages", () => {
    expect(numericTokens("Impacto de 1.5%")).toEqual(["1.5"]);
    expect(numericTokens("Impacto de 15%")).toEqual(["15"]);
    expect(numericTokens("Receita de R$ 1.500,00 e US$ 1,500.50")).toEqual(["1500", "1500.5"]);
    expect(sameNumbers("cut 1.5% of costs", "cut 15% of costs")).toBe(false);
    expect(sameNumbers("1,5 milhão", "1.5 million")).toBe(true);
    expect(sameNumbers("R$ 1.500", "BRL 1,500")).toBe(true);
  });
});

describe("numbers in the D4 limit and the humanizer preservation", () => {
  const target = resolveTargetLanguage("en");
  const base = {
    ...baseCv,
    summary: {
      id: "summary",
      text: "Engenheira backend com 8 anos; reduzi custos em 1,5% ao ano.",
    },
  };

  function tailorWith(addedText: string) {
    const output = tailoringOutput();
    const seg = output.tailoredCv.experiences[0]?.bullets.segments[1];
    if (seg) seg.text = addedText;
    return parseCvTailorResponse(output, { base, job, target });
  }

  it("a decimal in the base CV does not authorize a different integer in added text", () => {
    const result = tailorWith("Evaluated Kafka to cut costs by 15%.");
    expect(!result.ok && result.error.issues).toContain("seg-3: hard limit, added number");
  });

  it("the same value in another notation is not a new number", () => {
    expect(tailorWith("Evaluated Kafka to cut costs by 1.5%.").ok).toBe(true);
  });

  it("the humanizer may not turn 1.5 into 15", () => {
    const tailored = parseCvTailorResponse(tailoringOutput(), { base: baseCv, job, target });
    if (!tailored.ok) throw new Error(tailored.error.issues.join());
    const cv = tailored.value.cv;
    const seg2 = listSegments(cv).find(({ segment }) => segment.segmentId === "seg-2")?.segment;
    const before = {
      ...cv,
      experiences: cv.experiences.map((e) => ({
        ...e,
        bullets: {
          segments: e.bullets.segments.map((s) =>
            s.segmentId === "seg-2" ? { ...s, text: "Cut incidents by 1.5 points." } : s,
          ),
        },
      })),
    };
    expect(seg2).toBeDefined();
    const output = {
      schemaVersion: "1.0",
      injectionSuspected: false,
      injectionEvidence: null,
      segments: listSegments(before).map(({ segment }) =>
        segment.segmentId === "seg-2"
          ? {
              segmentId: "seg-2",
              text: "Cut incidents by 15 points.",
              changed: true,
              changeReason: "x",
            }
          : {
              segmentId: segment.segmentId,
              text: segment.text,
              changed: false,
              changeReason: null,
            },
      ),
    };
    const result = parseCvHumanizeResponse(output, { before, base: baseCv });
    expect(result.ok && result.value.revertedSegmentIds).toEqual(["seg-2"]);
  });
});
