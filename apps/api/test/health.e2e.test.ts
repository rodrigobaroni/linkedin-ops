import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  HealthStatusSchema,
  ProblemDetailsSchema,
  ReadinessStatusSchema,
} from "@linkedin-ops/contracts";
import { createTestApp, type TestApp } from "./helpers.js";

describe("GET /api/v1/health and /ready", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it("liveness answers 200 with the contract shape and a correlation id", async () => {
    const res = await app.request.get("/api/v1/health").expect(200);
    expect(HealthStatusSchema.safeParse(res.body).success).toBe(true);
    expect(res.headers["x-correlation-id"]).toMatch(/^req_[0-9a-f-]{36}$/);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });

  it("readiness answers 503 SERVICE_NOT_READY listing the checks when the database is down", async () => {
    const res = await app.request.get("/api/v1/ready").expect(503);
    expect(res.headers["content-type"]).toMatch(/application\/problem\+json/);
    expect(ProblemDetailsSchema.safeParse(res.body).success).toBe(true);
    expect(res.body.code).toBe("SERVICE_NOT_READY");
    expect(res.body.detail).toContain("database=failed");
    expect(res.body.detail).toContain("queue=skipped");
  });

  it("readiness answers 200 when the database is up and the queue is skipped", async () => {
    const healthy = await createTestApp({
      probes: [
        { name: "database", check: async () => "ok" },
        { name: "queue", check: async () => "skipped" },
      ],
    });
    try {
      const res = await healthy.request.get("/api/v1/ready").expect(200);
      expect(ReadinessStatusSchema.safeParse(res.body).success).toBe(true);
      expect(res.body).toEqual({ status: "ok", checks: { database: "ok", queue: "skipped" } });
    } finally {
      await healthy.close();
    }
  });

  it("sets security headers (helmet) and never exposes x-powered-by", async () => {
    const res = await app.request.get("/api/v1/health").expect(200);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});
