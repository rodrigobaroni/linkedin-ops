import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { QUEUES, routesV1, toJsonSchema, type RouteDefinition } from "../src/index.js";

const SECRET_KEY = /token|secret|password|apikey|api_key|ciphertext|passwordhash/i;
/** Keys that match the pattern but carry counts, not credentials (`GenerationUsage`). */
const ALLOWED_KEYS = new Set<string>(["inputTokens", "outputTokens"]);

function propertyNames(schema: Record<string, unknown>, found = new Set<string>()): Set<string> {
  const visit = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (node === null || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (record.properties && typeof record.properties === "object") {
      for (const key of Object.keys(record.properties as object)) found.add(key);
    }
    Object.values(record).forEach(visit);
  };
  visit(schema);
  return found;
}

describe("no secret ever appears in a response or job payload (contracts.md §6 rule 6, data-model.md I10)", () => {
  const responseSchemas = Object.entries(routesV1 as Record<string, RouteDefinition>).flatMap(
    ([key, route]) =>
      Object.entries(route.responses)
        .filter(([, schema]) => schema !== null)
        .map(([status, schema]) => ({ name: `${key} ${status}`, schema: schema as z.ZodType })),
  );

  for (const { name, schema } of responseSchemas) {
    it(`response ${name}`, () => {
      const offending = [...propertyNames(toJsonSchema(schema))].filter(
        (key) => SECRET_KEY.test(key) && !ALLOWED_KEYS.has(key),
      );
      expect(offending).toEqual([]);
    });
  }

  for (const queue of Object.values(QUEUES)) {
    it(`job payload ${queue.name}`, () => {
      const offending = [...propertyNames(toJsonSchema(queue.payload))].filter((key) =>
        SECRET_KEY.test(key),
      );
      expect(offending).toEqual([]);
    });
  }

  it("only login and reauth request bodies mention a password", () => {
    const bodiesWithPassword = Object.entries(routesV1 as Record<string, RouteDefinition>)
      .filter(
        ([, route]) =>
          route.body &&
          [...propertyNames(toJsonSchema(route.body))].some((key) => /password/i.test(key)),
      )
      .map(([key]) => key)
      .sort();
    expect(bodiesWithPassword).toEqual(["auth.login", "auth.reauth"]);
  });
});
