import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ProblemDetailsSchema } from "../src/common/problem.js";
import { buildOpenApiDocument, serializeOpenApiDocument } from "../src/openapi/document.js";
import { routesV1 } from "../src/routes/v1.js";

const COMMITTED = fileURLToPath(new URL("../openapi/v1.json", import.meta.url));

describe("OpenAPI document (contracts.md §5)", () => {
  const document = buildOpenApiDocument();

  it("openapi/v1.json matches the registry (contract drift) — run `pnpm openapi:generate` to refresh", () => {
    expect(readFileSync(COMMITTED, "utf8")).toBe(serializeOpenApiDocument(document));
  });

  it("documents every registered route exactly once, under /api/v1", () => {
    expect(document.servers).toEqual([{ url: "/api/v1" }]);
    const operations = Object.values(document.paths).flatMap((item) => Object.values(item));
    expect(operations).toHaveLength(Object.keys(routesV1).length);
    const ids = operations
      .map((operation) => (operation as { operationId: string }).operationId)
      .sort();
    expect(ids).toEqual(Object.keys(routesV1).sort());
  });

  it("every $ref resolves to a component and no component carries JSON Schema-only keywords", () => {
    const text = JSON.stringify(document);
    const refs = [...text.matchAll(/"\$ref":"#\/components\/schemas\/([A-Za-z0-9]+)"/g)].map(
      (m) => m[1],
    );
    expect(refs.length).toBeGreaterThan(0);
    for (const id of new Set(refs)) expect(document.components.schemas).toHaveProperty(id!);
    expect(text).not.toContain('"$defs"');
    expect(text).not.toContain('"definitions"');
    expect(text).not.toContain('"$schema"');
    expect(text).not.toContain('"$id"');
  });

  it("error responses reference ProblemDetails with application/problem+json", () => {
    const problem = document.components.schemas["ProblemDetails"];
    expect(problem).toBeDefined();
    const sample = document.paths["/auth/login"]!["post"] as {
      responses: Record<string, { content?: Record<string, unknown> }>;
    };
    expect(Object.keys(sample.responses).sort()).toEqual(["200", "400", "403", "429", "default"]);
    expect(sample.responses["429"]!.content).toHaveProperty("application/problem+json");
    expect(
      ProblemDetailsSchema.safeParse({
        type: "https://linkedin-ops.local/errors/validation-failed",
        title: "Requisição inválida",
        status: 400,
        code: "VALIDATION_FAILED",
        correlationId: "req_x",
      }).success,
    ).toBe(true);
  });

  it("mutations document the CSRF header and session-only routes the cookie scheme", () => {
    const login = document.paths["/auth/login"]!["post"] as {
      parameters: { name: string }[];
      security: unknown[];
    };
    expect(login.parameters.map((p) => p.name)).toContain("X-Requested-With");
    expect(login.security).toEqual([]);
    const me = document.paths["/auth/me"]!["get"] as { security: unknown[] };
    expect(me.security).toEqual([{ sessionCookie: [] }]);
  });
});
