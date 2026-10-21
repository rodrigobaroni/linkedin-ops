import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  LoginResponseSchema,
  MeSchema,
  ProblemDetailsSchema,
  ReauthResponseSchema,
} from "@linkedin-ops/contracts";
import {
  cookieHeader,
  createTestApp,
  mutationHeaders,
  TEST_USER,
  type TestApp,
} from "./helpers.js";

describe("auth routes: contract shape, Cache-Control: no-store, X-CSRF-Token (ADR-0007 N2)", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it("GET /auth/me returns the Me contract with csrfToken and no-store", async () => {
    const issued = app.sessions.issueForTest(TEST_USER);
    const res = await app.request
      .get("/api/v1/auth/me")
      .set("cookie", cookieHeader(issued.cookieValue))
      .expect(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(MeSchema.safeParse(res.body).success).toBe(true);
    expect(res.body.csrfToken).toBe(issued.session.csrfToken);
    expect(res.body.elevatedUntil).toBeNull();
  });

  it("GET /auth/me reports elevatedUntil for an elevated session", async () => {
    const issued = app.sessions.issueForTest(TEST_USER, { elevated: true });
    const res = await app.request
      .get("/api/v1/auth/me")
      .set("cookie", cookieHeader(issued.cookieValue))
      .expect(200);
    expect(res.body.elevatedUntil).toBe(issued.session.elevatedUntil?.toISOString());
  });

  it("POST /auth/login and /auth/reauth are no-store even on failure, with a generic 401", async () => {
    const login = await app.request
      .post("/api/v1/auth/login")
      .set(mutationHeaders())
      .send({ email: "rodrigo@example.test", password: "correct horse battery staple" })
      .expect(401);
    expect(login.headers["cache-control"]).toBe("no-store");
    expect(login.body.code).toBe("AUTH_INVALID_CREDENTIALS");
    expect(ProblemDetailsSchema.safeParse(login.body).success).toBe(true);

    const issued = app.sessions.issueForTest(TEST_USER);
    const reauth = await app.request
      .post("/api/v1/auth/reauth")
      .set(mutationHeaders({ cookie: cookieHeader(issued.cookieValue) }))
      .send({ password: "correct horse battery staple" })
      .expect(401);
    expect(reauth.headers["cache-control"]).toBe("no-store");
    expect(reauth.body.code).toBe("AUTH_INVALID_CREDENTIALS");
  });

  it("a successful login (session service stubbed) answers 200 { csrfToken, elevatedUntil: null }, sets __Host-session and X-CSRF-Token together", async () => {
    const issued = app.sessions.issueForTest(TEST_USER);
    const original = app.sessions.login.bind(app.sessions);
    app.sessions.login = async () => issued;
    try {
      const res = await app.request
        .post("/api/v1/auth/login")
        .set(mutationHeaders())
        .send({ email: TEST_USER.email, password: "correct horse battery staple" })
        .expect(200);
      expect(LoginResponseSchema.safeParse(res.body).success).toBe(true);
      expect(res.body).toEqual({ csrfToken: issued.session.csrfToken, elevatedUntil: null });
      expect(res.headers["cache-control"]).toBe("no-store");
      expect(res.headers["x-csrf-token"]).toBe(issued.session.csrfToken);
      const setCookie = (res.headers["set-cookie"] as unknown as string[]).join(";");
      expect(setCookie).toContain(`__Host-session=${issued.cookieValue}`);
      expect(setCookie).toMatch(/HttpOnly/i);
      expect(setCookie).toMatch(/Secure/i);
      expect(setCookie).toMatch(/SameSite=Lax/i);
      expect(setCookie).toMatch(/Path=\//);
      expect(setCookie).not.toMatch(/Domain=/i);
    } finally {
      app.sessions.login = original;
    }
  });

  it("a successful reauth (session service stubbed) answers 200 { csrfToken, elevatedUntil }, rotates __Host-session and X-CSRF-Token together", async () => {
    const current = app.sessions.issueForTest(TEST_USER);
    const elevated = app.sessions.issueForTest(TEST_USER, { elevated: true });
    const original = app.sessions.reauth.bind(app.sessions);
    app.sessions.reauth = async () => elevated;
    try {
      const res = await app.request
        .post("/api/v1/auth/reauth")
        .set(mutationHeaders({ cookie: cookieHeader(current.cookieValue) }))
        .send({ password: "correct horse battery staple" })
        .expect(200);
      expect(ReauthResponseSchema.safeParse(res.body).success).toBe(true);
      expect(res.body).toEqual({
        csrfToken: elevated.session.csrfToken,
        elevatedUntil: elevated.session.elevatedUntil?.toISOString(),
      });
      expect(res.body.csrfToken).not.toBe(current.session.csrfToken);
      expect(res.headers["cache-control"]).toBe("no-store");
      expect(res.headers["x-csrf-token"]).toBe(elevated.session.csrfToken);
      const setCookie = (res.headers["set-cookie"] as unknown as string[]).join(";");
      expect(setCookie).toContain(`__Host-session=${elevated.cookieValue}`);
      expect(setCookie).not.toContain(current.cookieValue);
      expect(setCookie).toMatch(/HttpOnly/i);
      expect(setCookie).toMatch(/Secure/i);
    } finally {
      app.sessions.reauth = original;
    }
  });
});
