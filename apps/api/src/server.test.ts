import type { AddressInfo } from "node:net";
import { HealthStatusSchema } from "@linkedin-ops/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApiServer, HEALTH_PATH } from "./server.js";

describe("placeholder api server", () => {
  const server = createApiServer();
  let baseUrl = "";

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("answers GET /api/v1/health with the HealthStatus contract, ignoring the query string", async () => {
    const response = await fetch(`${baseUrl}${HEALTH_PATH}?code=x&state=y`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(HealthStatusSchema.parse(await response.json())).toMatchObject({ status: "ok" });
  });

  it("answers HEAD /api/v1/health without a body", async () => {
    const response = await fetch(`${baseUrl}${HEALTH_PATH}`, { method: "HEAD" });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });

  it("rejects other methods on the health route", async () => {
    const response = await fetch(`${baseUrl}${HEALTH_PATH}`, { method: "POST" });
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD");
  });

  it("answers 404 JSON for any other path", async () => {
    const response = await fetch(`${baseUrl}/api/v1/anything`);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "NOT_FOUND" });
  });
});
