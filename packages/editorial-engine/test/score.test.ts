import { describe, expect, it } from "vitest";
import { MATCH_SCORE_WEIGHTS, computeBaseScore } from "../src/index.js";

describe("computeBaseScore (career-prompts.md §3, weights 70/30)", () => {
  it("pins the versioned weights", () => {
    expect(MATCH_SCORE_WEIGHTS).toEqual({ version: "1.0.0", mandatory: 0.7, desirable: 0.3 });
  });

  it("weighs mandatory 70% and desirable 30%", () => {
    expect(
      computeBaseScore([
        { kind: "mandatory", status: "met" },
        { kind: "desirable", status: "missing" },
      ]),
    ).toBe(70);
    expect(
      computeBaseScore([
        { kind: "mandatory", status: "missing" },
        { kind: "desirable", status: "met" },
      ]),
    ).toBe(30);
  });

  it("counts partial as half", () => {
    expect(computeBaseScore([{ kind: "mandatory", status: "partial" }])).toBe(50);
  });

  it("gives 100% to the only kind present", () => {
    expect(computeBaseScore([{ kind: "desirable", status: "met" }])).toBe(100);
    expect(
      computeBaseScore([
        { kind: "mandatory", status: "met" },
        { kind: "mandatory", status: "missing" },
      ]),
    ).toBe(50);
  });

  it("is 0 without requirements and an integer otherwise", () => {
    expect(computeBaseScore([])).toBe(0);
    const score = computeBaseScore([
      { kind: "mandatory", status: "met" },
      { kind: "mandatory", status: "partial" },
      { kind: "mandatory", status: "missing" },
      { kind: "desirable", status: "partial" },
    ]);
    expect(Number.isInteger(score)).toBe(true);
    expect(score).toBe(Math.round(((1 + 0.5) / 3) * 70 + 0.5 * 30));
  });
});
