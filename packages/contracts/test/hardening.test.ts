import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  AuditEventSchema,
  AuditSnapshotSchema,
  IdParamsSchema,
  LinkedInCallbackQuerySchema,
  LoginInputSchema,
  PASSWORD_MIN_LENGTH,
  PaginationQuerySchema,
  PasswordSchema,
  QUEUES,
  REDACTED_JSON_MAX_DEPTH,
  RequestedBySchema,
  isSensitiveKey,
  routesV1,
  toJsonSchema,
  type RouteDefinition,
} from "../src/index.js";
import { auditEvent, autonomySettingsInput } from "./fixtures/resources.js";
import { jobPayloads } from "./fixtures/jobs.js";
import { patch } from "./helpers.js";

const entries = Object.entries(routesV1) as Array<[string, RouteDefinition]>;
const route = (key: string) =>
  (routesV1 as Record<string, RouteDefinition>)[key] as RouteDefinition;

describe("S-1 · RBAC and elevation matrix (ADR-0007 §3, §11)", () => {
  const highRisk = [
    "integrations.linkedin.connect",
    "integrations.linkedin.disconnect",
    "settings.autonomy.update",
    "drafts.publish",
    "drafts.retryPublication",
  ];
  for (const key of highRisk) {
    it(`${key} is elevated, OWNER-only and rate-limited`, () => {
      expect(route(key).auth).toBe("elevated");
      expect(route(key).roles).toEqual(["OWNER"]);
      expect(route(key).rateLimited).toBe(true);
    });
  }
  it("every elevated route is OWNER-only", () => {
    for (const [key, definition] of entries) {
      if (definition.auth === "elevated") expect(definition.roles, key).toEqual(["OWNER"]);
    }
  });
  it("roles are never declared on public routes", () => {
    for (const [key, definition] of entries) {
      if (definition.auth === "none") expect(definition.roles, key).toBeUndefined();
    }
  });
});

describe("S-5 · rate limits (ADR-0007 §10)", () => {
  for (const key of [
    "auth.login",
    "auth.reauth",
    "integrations.linkedin.connect",
    "integrations.linkedin.callback",
    "integrations.linkedin.disconnect",
    "settings.autonomy.update",
    "drafts.publish",
    "drafts.retryPublication",
    "drafts.regenerate",
    "curationRuns.create",
  ]) {
    it(`${key} is rate-limited`, () => expect(route(key).rateLimited).toBe(true));
  }
});

describe("S-2 · audit snapshots reject credential-like keys at any depth (I10, TM-04)", () => {
  const canaries: Record<string, unknown> = {
    "top-level accessToken": { accessToken: "x" },
    "nested refreshToken": { a: { b: { refreshToken: "x" } } },
    "inside array": { items: [{ clientSecret: "x" }] },
    passwordHash: { passwordHash: "x" },
    ciphertext: { oauth: { access_token_ciphertext: "x" } },
    "api key": { config: { apiKey: "x" } },
    authorization: { headers: { Authorization: "Bearer x" } },
    cookie: { headers: { cookie: "x" } },
  };
  for (const [label, snapshot] of Object.entries(canaries)) {
    it(`rejects ${label}`, () => {
      expect(AuditSnapshotSchema.safeParse(snapshot).success).toBe(false);
      expect(AuditEventSchema.safeParse({ ...auditEvent, after: snapshot }).success).toBe(false);
    });
  }
  it("accepts a redacted diff with nesting and arrays", () => {
    expect(
      AuditSnapshotSchema.safeParse({
        status: "APPROVED",
        settings: { mode: "ASSISTED", pillars: ["a", "b"], n: 1, flag: true, none: null },
      }).success,
    ).toBe(true);
    expect(
      AuditSnapshotSchema.safeParse({ usage: { inputTokens: 1, outputTokens: 2 } }).success,
    ).toBe(true);
  });
  it("bounds nesting depth", () => {
    let deep: Record<string, unknown> = { leaf: 1 };
    for (let level = 0; level < REDACTED_JSON_MAX_DEPTH; level += 1) deep = { nested: deep };
    expect(AuditSnapshotSchema.safeParse(deep).success).toBe(false);
  });
  it("isSensitiveKey allows token counters only", () => {
    expect(isSensitiveKey("inputTokens")).toBe(false);
    expect(isSensitiveKey("accessToken")).toBe(true);
    expect(isSensitiveKey("passwd")).toBe(true);
    expect(isSensitiveKey("status")).toBe(false);
  });
});

describe("S-3 · OAuth callback: exactly one of code/error", () => {
  it.each([
    [{ state: "s", code: "c" }, true],
    [{ state: "s", error: "access_denied" }, true],
    [{ state: "s" }, false],
    [{ state: "s", code: "c", error: "access_denied" }, false],
    [{ state: "s", error: "" }, false],
    [{ code: "c" }, false],
  ])("%j → %s", (query, ok) => {
    expect(LinkedInCallbackQuerySchema.safeParse(query).success).toBe(ok);
  });
});

describe("S-4 · password boundary (ADR-0007: minimum 15)", () => {
  it("rejects 14 and accepts 15 characters", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(15);
    expect(PasswordSchema.safeParse("a".repeat(14)).success).toBe(false);
    expect(PasswordSchema.safeParse("a".repeat(15)).success).toBe(true);
    expect(LoginInputSchema.safeParse({ email: "a@b.co", password: "a".repeat(14) }).success).toBe(
      false,
    );
  });
});

describe("S-6 · inputs, queries, params and job payloads are strict (TM-06)", () => {
  /** Every object node in the *input* JSON Schema must close itself; strip objects omit additionalProperties. */
  function openObjects(schema: Record<string, unknown>, where = "#"): string[] {
    const open: string[] = [];
    const visit = (node: unknown, path: string) => {
      if (Array.isArray(node))
        return node.forEach((child, index) => visit(child, `${path}/${index}`));
      if (node === null || typeof node !== "object") return;
      const record = node as Record<string, unknown>;
      if (record.type === "object" && record.properties && record.additionalProperties !== false)
        open.push(path);
      for (const [key, value] of Object.entries(record)) visit(value, `${path}/${key}`);
    };
    visit(schema, where);
    return open;
  }

  for (const [key, definition] of entries) {
    for (const part of ["body", "query", "params"] as const) {
      const schema = definition[part] as z.ZodType | undefined;
      if (!schema) continue;
      it(`${key} ${part} rejects unknown keys at every level`, () => {
        expect(openObjects(toJsonSchema(schema, { io: "input" }))).toEqual([]);
      });
    }
  }
  for (const queue of Object.values(QUEUES)) {
    it(`job ${queue.name} rejects unknown keys`, () => {
      expect(openObjects(toJsonSchema(queue.payload, { io: "input" }))).toEqual([]);
      expect(
        queue.payload.safeParse({ ...jobPayloads[queue.name], accessToken: "x" }).success,
      ).toBe(false);
      expect(
        queue.payload.safeParse(patch(jobPayloads[queue.name], "requestedBy.authority", "root"))
          .success,
      ).toBe(false);
    });
  }

  it("concrete canaries fail instead of being stripped", () => {
    expect(
      LoginInputSchema.safeParse({ email: "a@b.co", password: "a".repeat(15), accessToken: "x" })
        .success,
    ).toBe(false);
    expect(RequestedBySchema.safeParse({ type: "USER", id: "u", authority: "root" }).success).toBe(
      false,
    );
    expect(
      IdParamsSchema.safeParse({ id: "018f6b1e-7c2a-7b3c-9d4e-000000000001", extra: 1 }).success,
    ).toBe(false);
    expect(PaginationQuerySchema.safeParse({ limit: "10", debug: "1" }).success).toBe(false);
    expect(
      route("settings.autonomy.update").body?.safeParse({
        ...autonomySettingsInput,
        quietHours: { ...autonomySettingsInput.quietHours, token: "x" },
      }).success,
    ).toBe(false);
    expect(
      route("drafts.schedule").body?.safeParse({
        versionId: "018f6b1e-7c2a-7b3c-9d4e-000000000009",
        localDateTime: "2026-10-15T09:00",
        timezone: "America/Sao_Paulo",
        expectedRowVersion: 1,
        force: true,
      }).success,
    ).toBe(false);
  });
});
