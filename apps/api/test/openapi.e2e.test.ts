import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serializeOpenApiDocument } from "@linkedin-ops/contracts";
import { cookieHeader, createTestApp, TEST_USER, testEnv, type TestApp } from "./helpers.js";

describe("OpenAPI and docs exposure (contracts.md §5)", () => {
  describe("outside development", () => {
    let app: TestApp;
    beforeAll(async () => {
      app = await createTestApp();
    });
    afterAll(() => app.close());

    it("/api/v1/openapi.json requires a session and serves the generated document", async () => {
      await app.request.get("/api/v1/openapi.json").expect(401);
      const issued = app.sessions.issueForTest(TEST_USER);
      const res = await app.request
        .get("/api/v1/openapi.json")
        .set("cookie", cookieHeader(issued.cookieValue))
        .expect(200);
      expect(`${JSON.stringify(res.body, null, 2)}\n`).toBe(serializeOpenApiDocument());
      expect(res.headers["cache-control"]).toBe("no-store");
    });

    it("/docs does not exist", async () => {
      await app.request.get("/docs").expect(404);
      await app.request.get("/docs/assets/swagger-ui.css").expect(404);
    });
  });

  describe("in development", () => {
    let app: TestApp;
    beforeAll(async () => {
      app = await createTestApp({
        env: testEnv({ NODE_ENV: "development", APP_BASE_URL: "http://localhost:3000" }),
      });
    });
    afterAll(() => app.close());

    it("/api/v1/openapi.json is public", async () => {
      const res = await app.request.get("/api/v1/openapi.json").expect(200);
      expect(res.body.openapi).toBe("3.0.3");
    });

    it("/docs serves Swagger UI from local assets with a strict CSP", async () => {
      const page = await app.request.get("/docs").expect(200);
      expect(page.headers["content-type"]).toMatch(/text\/html/);
      expect(page.headers["content-security-policy"]).toContain("script-src 'self'");
      expect(page.text).toContain("/docs/assets/swagger-ui-bundle.js");
      await app.request.get("/docs/init.js").expect(200);
      const css = await app.request.get("/docs/assets/swagger-ui.css").expect(200);
      expect(css.headers["content-type"]).toMatch(/text\/css/);
      const traversal = await app.request.get("/docs/assets/../package.json");
      expect([403, 404]).toContain(traversal.status);
    });
  });
});
