import { describe, expect, it } from "vitest";
import { careerCases } from "./fixtures/career.js";
import { jobCases } from "./fixtures/jobs.js";
import { resourceCases } from "./fixtures/resources.js";
import { structuredOutputCases } from "./fixtures/structured-outputs.js";

const allCases = [...resourceCases, ...structuredOutputCases, ...careerCases, ...jobCases];

describe("every schema accepts its valid example and rejects invalid variants", () => {
  for (const schemaCase of allCases) {
    describe(schemaCase.name, () => {
      it("accepts the valid example", () => {
        const result = schemaCase.schema.safeParse(schemaCase.valid);
        expect(
          result.success,
          result.success ? "" : JSON.stringify(result.error.issues, null, 2),
        ).toBe(true);
      });

      it("has at least two invalid variants", () => {
        expect(Object.keys(schemaCase.invalid).length).toBeGreaterThanOrEqual(2);
      });

      for (const [label, mutate] of Object.entries(schemaCase.invalid)) {
        it(`rejects: ${label}`, () => {
          const mutated = mutate(schemaCase.valid);
          expect(mutated, "mutation must change the fixture").not.toEqual(schemaCase.valid);
          expect(schemaCase.schema.safeParse(mutated).success).toBe(false);
        });
      }
    });
  }
});

describe("fixture coverage", () => {
  it("names are unique", () => {
    const names = allCases.map((schemaCase) => schemaCase.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
