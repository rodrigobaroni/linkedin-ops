import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  API_V1_BASE_PATH,
  pathParamNames,
  routesV1,
  toJsonSchema,
  type RouteDefinition,
} from "../src/index.js";

const entries = Object.entries(routesV1) as Array<[string, RouteDefinition]>;

describe("routes/v1 registry", () => {
  it("has a base path of /api/v1", () => {
    expect(API_V1_BASE_PATH).toBe("/api/v1");
  });

  it("method + path pairs are unique", () => {
    const keys = entries.map(([, route]) => `${route.method} ${route.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("paths are relative, lowercase kebab-case with {param} placeholders", () => {
    for (const [, route] of entries) {
      expect(route.path.startsWith("/")).toBe(true);
      expect(route.path).toMatch(/^(?:\/(?:[a-z0-9-]+|\{[a-zA-Z]+\}))+$/);
    }
  });

  it("path params match the params schema exactly", () => {
    for (const [key, route] of entries) {
      const names = pathParamNames(route.path);
      const declared = route.params ? Object.keys(route.params.shape) : [];
      expect([...declared].sort(), key).toEqual([...names].sort());
    }
  });

  it("GET and DELETE routes carry no body", () => {
    for (const [key, route] of entries) {
      if (route.method === "GET" || route.method === "DELETE")
        expect(route.body, key).toBeUndefined();
    }
  });

  it("async routes answer 202 and are POST", () => {
    for (const [key, route] of entries) {
      if (route.async) {
        expect(route.method, key).toBe("POST");
        expect(route.responses[202], key).toBeDefined();
      }
    }
  });

  it("Idempotency-Key is only declared on POST routes; publish/schedule/curation/select/regenerate require it", () => {
    for (const [key, route] of entries) {
      if (route.idempotencyKey) expect(route.method, key).toBe("POST");
    }
    for (const key of [
      "drafts.publish",
      "drafts.schedule",
      "drafts.regenerate",
      "drafts.retryPublication",
      "publications.publishNow",
      "curationRuns.create",
      "opportunities.select",
      "opportunities.createManual",
    ]) {
      expect((routesV1 as Record<string, RouteDefinition>)[key]?.idempotencyKey, key).toBe(
        "required",
      );
    }
  });

  it("high-risk routes require an elevated session (ADR-0007)", () => {
    for (const key of [
      "drafts.publish",
      "drafts.retryPublication",
      "publications.publishNow",
      "settings.autonomy.update",
      "integrations.linkedin.connect",
      "integrations.linkedin.disconnect",
    ]) {
      expect((routesV1 as Record<string, RouteDefinition>)[key]?.auth, key).toBe("elevated");
    }
  });

  it("only health, login and the OAuth callback are public", () => {
    const publicRoutes = entries.filter(([, route]) => route.auth === "none").map(([key]) => key);
    expect(publicRoutes.sort()).toEqual([
      "auth.login",
      "health.liveness",
      "health.readiness",
      "integrations.linkedin.callback",
    ]);
  });

  it("every route has at least one success response and 204/302 responses have no body", () => {
    for (const [key, route] of entries) {
      const statuses = Object.keys(route.responses);
      expect(statuses.length, key).toBeGreaterThan(0);
      for (const [status, schema] of Object.entries(route.responses)) {
        if (status === "204" || status === "302") expect(schema, `${key} ${status}`).toBeNull();
        else expect(schema, `${key} ${status}`).toBeInstanceOf(z.ZodType);
      }
    }
  });

  it("covers every resource of contracts.md §2", () => {
    const tags = new Set(entries.map(([, route]) => route.tag));
    for (const tag of [
      "health",
      "auth",
      "integrations",
      "settings",
      "voice-profile",
      "story-bank",
      "content-pillars",
      "sources",
      "watchlists",
      "curation",
      "opportunities",
      "drafts",
      "schedules",
      "publications",
      "media",
      "notifications",
      "audit",
    ]) {
      expect(tags.has(tag), tag).toBe(true);
    }
  });

  it("every 202 response extends AsyncAccepted { id, status, jobId } (contracts.md §1)", () => {
    for (const [key, route] of entries) {
      const accepted = route.responses[202];
      if (!accepted) continue;
      const properties = toJsonSchema(accepted).properties as Record<string, unknown>;
      expect(Object.keys(properties), key).toEqual(
        expect.arrayContaining(["id", "status", "jobId"]),
      );
    }
  });

  it("audit events are OWNER-only", () => {
    expect(routesV1["auditEvents.list"].roles).toEqual(["OWNER"]);
  });
});
