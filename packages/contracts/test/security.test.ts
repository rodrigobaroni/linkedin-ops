import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  QUEUES,
  isSensitiveKey,
  routesV1,
  toJsonSchema,
  type RouteDefinition,
} from "../src/index.js";

/** ADR-0007 N2: the anti-CSRF token is handed over by exactly these responses and nowhere else. */
const CSRF_TOKEN_ROUTES = new Set(["auth.login", "auth.reauth", "auth.me"]);

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
      const routeKey = name.split(" ")[0] as string;
      const offending = [...propertyNames(toJsonSchema(schema))].filter(
        (key) => isSensitiveKey(key) && !(key === "csrfToken" && CSRF_TOKEN_ROUTES.has(routeKey)),
      );
      expect(offending).toEqual([]);
    });
  }

  it("csrfToken is returned by login, reauth and me only (ADR-0007 N2)", () => {
    const withCsrf = responseSchemas
      .filter(({ schema }) => propertyNames(toJsonSchema(schema)).has("csrfToken"))
      .map(({ name }) => name.split(" ")[0]);
    expect([...new Set(withCsrf)].sort()).toEqual([...CSRF_TOKEN_ROUTES].sort());
    expect(isSensitiveKey("csrfToken"), "snapshots still reject it").toBe(true);
  });

  for (const queue of Object.values(QUEUES)) {
    it(`job payload ${queue.name}`, () => {
      const offending = [...propertyNames(toJsonSchema(queue.payload))].filter(isSensitiveKey);
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
