import { describe, expect, it } from "vitest";
import {
  STRUCTURED_OUTPUTS,
  findStrictModeViolations,
  structuredOutputJsonSchema,
  toJsonSchema,
  toOpenApiSchema,
  type StructuredOutputKey,
} from "../src/index.js";

const keys = Object.keys(STRUCTURED_OUTPUTS) as StructuredOutputKey[];

/** `type: [..., "null"]` or `anyOf: [..., { type: "null" }]` — both accepted by OpenAI strict mode. */
function allowsNull(node: Record<string, unknown> | undefined): boolean {
  if (!node) return false;
  if (Array.isArray(node.type) && node.type.includes("null")) return true;
  const anyOf = node.anyOf as Array<Record<string, unknown>> | undefined;
  return Array.isArray(anyOf) && anyOf.some((option) => option.type === "null");
}

describe("Structured Outputs JSON Schema (OpenAI strict mode)", () => {
  for (const key of keys) {
    describe(STRUCTURED_OUTPUTS[key].name, () => {
      const output = structuredOutputJsonSchema(key);

      it("is strict: closed objects, every property required, no $schema", () => {
        expect(output.strict).toBe(true);
        expect(output.name).toBe(STRUCTURED_OUTPUTS[key].name);
        expect(output.schema.$schema).toBeUndefined();
        expect(findStrictModeViolations(output.schema)).toEqual([]);
      });

      it("pins schemaVersion 1.0 and uses $defs for shared enums/objects", () => {
        const properties = output.schema.properties as Record<string, Record<string, unknown>>;
        expect(properties.schemaVersion).toEqual({ type: "string", const: "1.0" });
        expect(output.schema.$defs).toBeDefined();
      });

      it("expresses optionals as nullable types, not missing properties", () => {
        const json = JSON.stringify(output.schema);
        expect(json).not.toContain('"required":[]');
      });
    });
  }

  it("registry maps each output to its prompt id (ADR-0005 §3)", () => {
    expect(STRUCTURED_OUTPUTS.opportunityClassification.promptId).toBe("opportunity-classify");
    expect(STRUCTURED_OUTPUTS.editorialBrief.promptId).toBe("brief");
    expect(STRUCTURED_OUTPUTS.postDraft.promptId).toBe("draft-writer");
    expect(STRUCTURED_OUTPUTS.mediaSuggestion.promptId).toBe("media");
    expect(STRUCTURED_OUTPUTS.qualityEvaluation.promptId).toBe("quality");
    expect(STRUCTURED_OUTPUTS.voiceProfileExtraction.promptId).toBe("voice-extract");
  });

  it("shared $defs match docs/editorial/structured-outputs.md §1.1", () => {
    const defs = structuredOutputJsonSchema("editorialBrief").schema.$defs as Record<
      string,
      Record<string, unknown>
    >;
    expect(defs.SourceRef?.required).toEqual(["sourceId", "usedFor", "quote"]);
    expect(defs.FactRef?.required).toEqual(["claim", "kind", "refType", "refId", "status"]);
    expect(defs.HookFormula?.enum).toEqual([
      "H00",
      "H01",
      "H02",
      "H03",
      "H04",
      "H05",
      "H07",
      "H08",
      "H09",
      "H10",
      "H11",
      "H12",
      "H14",
      "H15",
      "H16",
      "H17",
      "H18",
      "H19",
      "H20",
    ]);
    expect(defs.SuggestedFormat?.enum).toEqual(["text", "code-card", "image", "carousel"]);
  });

  it("MediaSuggestion altText is nullable string (required when type != none)", () => {
    const properties = structuredOutputJsonSchema("mediaSuggestion").schema.properties as Record<
      string,
      Record<string, unknown>
    >;
    expect(allowsNull(properties.altText)).toBe(true);
    expect(JSON.stringify(properties.altText)).toContain('"maxLength":300');
    expect(structuredOutputJsonSchema("mediaSuggestion").schema.required as string[]).toContain(
      "altText",
    );
  });
});

describe("JSON Schema helpers", () => {
  it("toJsonSchema emits draft 2020-12 by default", () => {
    const schema = toJsonSchema(STRUCTURED_OUTPUTS.qualityEvaluation.schema);
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
  });

  it("toOpenApiSchema uses OpenAPI 3.0 nullable and no $schema", () => {
    const schema = toOpenApiSchema(STRUCTURED_OUTPUTS.mediaSuggestion.schema);
    expect(schema.$schema).toBeUndefined();
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    expect(properties.altText?.nullable).toBe(true);
  });
});
