import { z } from "zod";

/** JSON Schema document as emitted by Zod. */
export type JsonSchema = Record<string, unknown>;

export interface ToJsonSchemaOptions {
  /** JSON Schema dialect. `draft-2020-12` (default) for Structured Outputs; `openapi-3.0` for the OpenAPI spec. */
  target?: "draft-2020-12" | "openapi-3.0";
  /** `output` (default) describes parsed values (defaults applied); `input` describes what the client may send. */
  io?: "input" | "output";
}

/**
 * Converts a Zod schema to JSON Schema. Schemas registered with `.meta({ id })` become `$defs`/components.
 * Refinements (`.refine`) are not representable and are validated by Zod only.
 */
export function toJsonSchema(schema: z.ZodType, options: ToJsonSchemaOptions = {}): JsonSchema {
  const generated = z.toJSONSchema(schema, {
    target: options.target ?? "draft-2020-12",
    io: options.io ?? "output",
    unrepresentable: "any",
    reused: "inline",
  }) as JsonSchema;
  return inlineRootRef(generated);
}

/**
 * Zod hoists a root schema that carries `meta.id` into `$defs` and leaves a bare `$ref` at the root.
 * Structured Outputs and OpenAPI components want the object itself at the root, so inline it back
 * (unless something else references it, e.g. a recursive schema).
 */
function inlineRootRef(schema: JsonSchema): JsonSchema {
  const ref = schema.$ref;
  if (typeof ref !== "string") return schema;
  const container = schema.$defs ? "$defs" : schema.definitions ? "definitions" : null;
  if (!container) return schema;
  const prefix = `#/${container}/`;
  if (!ref.startsWith(prefix)) return schema;
  const name = ref.slice(prefix.length);
  const defs = { ...(schema[container] as Record<string, JsonSchema>) };
  const root = defs[name];
  if (!root) return schema;
  delete defs[name];
  if (JSON.stringify(defs).includes(`"${ref}"`)) return schema;
  const { $ref: _ref, [container]: _defs, ...rest } = schema;
  const result: JsonSchema = { ...rest, ...root };
  if (Object.keys(defs).length > 0) result[container] = defs;
  return result;
}

/** JSON Schema fragment for an OpenAPI 3.0 document (nullable via `nullable: true`, no `$schema`). */
export function toOpenApiSchema(schema: z.ZodType, io: "input" | "output" = "output"): JsonSchema {
  return toJsonSchema(schema, { target: "openapi-3.0", io });
}

/** Shape expected by OpenAI `text.format = { type: "json_schema", ... }` (minus `type`, owned by the engine). */
export interface StructuredOutputSchema {
  name: string;
  strict: true;
  schema: JsonSchema;
}

/**
 * Strict JSON Schema for OpenAI Structured Outputs: draft 2020-12, every object with
 * `additionalProperties: false` and all properties required (Zod objects already satisfy this when
 * optional fields are expressed as `.nullable()` instead of `.optional()`). `$schema` is dropped.
 */
export function toStructuredOutputSchema(name: string, schema: z.ZodType): StructuredOutputSchema {
  const { $schema: _dialect, ...rest } = toJsonSchema(schema, {
    target: "draft-2020-12",
    io: "output",
  });
  return { name, strict: true, schema: rest };
}

/** Walks a JSON Schema and reports violations of the OpenAI strict-mode rules. Useful in tests. */
export function findStrictModeViolations(schema: JsonSchema, path = "#"): string[] {
  const violations: string[] = [];
  const visit = (node: unknown, where: string) => {
    if (Array.isArray(node)) {
      node.forEach((child, index) => visit(child, `${where}/${index}`));
      return;
    }
    if (node === null || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (record.type === "object" && record.properties && typeof record.properties === "object") {
      const keys = Object.keys(record.properties as object);
      const required = Array.isArray(record.required) ? (record.required as string[]) : [];
      if (record.additionalProperties !== false)
        violations.push(`${where}: additionalProperties must be false`);
      for (const key of keys) {
        if (!required.includes(key))
          violations.push(`${where}: property "${key}" must be required`);
      }
    }
    if (record.type === "object" && !record.properties && record.additionalProperties !== false) {
      violations.push(`${where}: free-form objects are not allowed in strict mode`);
    }
    for (const [key, value] of Object.entries(record)) visit(value, `${where}/${key}`);
  };
  visit(schema, path);
  return violations;
}
