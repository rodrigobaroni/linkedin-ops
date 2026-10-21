import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ProblemDetailsSchema } from "@linkedin-ops/contracts";
import { createTestApp, mutationHeaders, type TestApp } from "./helpers.js";
import { BoomController } from "./probe.controllers.js";

describe("Problem Details (RFC 9457, contracts.md §4)", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp({ controllers: [BoomController] });
  });
  afterAll(() => app.close());

  it("unknown route → 404 NOT_FOUND in the standard format", async () => {
    const res = await app.request.get("/api/v1/nope").expect(404);
    expect(res.headers["content-type"]).toMatch(/application\/problem\+json/);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(ProblemDetailsSchema.safeParse(res.body).success).toBe(true);
    expect(res.body).toMatchObject({
      type: "https://linkedin-ops.local/errors/not-found",
      title: "Recurso não encontrado",
      status: 404,
      code: "NOT_FOUND",
      instance: "/api/v1/nope",
    });
    expect(res.body.correlationId).toBe(res.headers["x-correlation-id"]);
  });

  it("invalid body → 400 VALIDATION_FAILED with errors[] per field (unknown keys rejected)", async () => {
    const res = await app.request
      .post("/api/v1/auth/login")
      .set(mutationHeaders())
      .send({ email: "not-an-email", password: "short", extra: 1 })
      .expect(400);
    expect(ProblemDetailsSchema.safeParse(res.body).success).toBe(true);
    expect(res.body.code).toBe("VALIDATION_FAILED");
    expect(res.body.title).toBe("Requisição inválida");
    const paths = (res.body.errors as { path: (string | number)[] }[]).map((e) => e.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["email", "password", "extra"]));
  });

  it("malformed JSON → 400 VALIDATION_FAILED", async () => {
    const res = await app.request
      .post("/api/v1/auth/login")
      .set(mutationHeaders())
      .send('{"email": ')
      .expect(400);
    expect(res.body.code).toBe("VALIDATION_FAILED");
    expect(ProblemDetailsSchema.safeParse(res.body).success).toBe(true);
  });

  it("body over the limit → 413 PAYLOAD_TOO_LARGE", async () => {
    // Fastify answers 413 as soon as Content-Length exceeds the limit and closes the socket, which makes
    // a real client see ECONNRESET mid-write; light-my-request observes the response deterministically.
    const res = await app.fastify.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: mutationHeaders(),
      payload: JSON.stringify({ email: "a@b.co", password: "x".repeat(1_100_000) }),
    });
    expect(res.statusCode).toBe(413);
    const body = res.json();
    expect(body.code).toBe("PAYLOAD_TOO_LARGE");
    expect(ProblemDetailsSchema.safeParse(body).success).toBe(true);
  });

  it("unexpected exception → 500 INTERNAL without internal details, logged with the correlation id", async () => {
    const res = await app.request.get("/api/v1/__probe/boom").expect(500);
    expect(ProblemDetailsSchema.safeParse(res.body).success).toBe(true);
    expect(res.body).toMatchObject({ code: "INTERNAL", title: "Erro interno" });
    expect(JSON.stringify(res.body)).not.toContain("secret internal detail");
    const line = app.logs.lines.find(
      (l) => l["correlationId"] === res.body.correlationId && l["level"] === "error",
    );
    expect(line).toBeDefined();
  });
});
