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
  testEnv,
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
    app.sessions.login = async () => ({ kind: "ok", issued });
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
    app.sessions.reauth = async () => ({ kind: "ok", issued: elevated });
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

describe("auth routes: rate limit, logout, session gone, client IP", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it("a throttled login answers 429 RATE_LIMITED with Retry-After in whole seconds and no-store", async () => {
    const original = app.sessions.login.bind(app.sessions);
    app.sessions.login = async () => ({ kind: "rate_limited", retryAfterSeconds: 897 });
    try {
      const res = await app.request
        .post("/api/v1/auth/login")
        .set(mutationHeaders())
        .send({ email: TEST_USER.email, password: "correct horse battery staple" })
        .expect(429);
      expect(res.body.code).toBe("RATE_LIMITED");
      expect(res.headers["retry-after"]).toBe("897");
      expect(res.headers["cache-control"]).toBe("no-store");
      expect(res.headers["set-cookie"]).toBeUndefined();
    } finally {
      app.sessions.login = original;
    }
  });

  it("a reauth whose session was rotated meanwhile answers 401 AUTH_REQUIRED", async () => {
    const issued = app.sessions.issueForTest(TEST_USER);
    const original = app.sessions.reauth.bind(app.sessions);
    app.sessions.reauth = async () => ({ kind: "session_gone" });
    try {
      const res = await app.request
        .post("/api/v1/auth/reauth")
        .set(mutationHeaders({ cookie: cookieHeader(issued.cookieValue) }))
        .send({ password: "correct horse battery staple" })
        .expect(401);
      expect(res.body.code).toBe("AUTH_REQUIRED");
    } finally {
      app.sessions.reauth = original;
    }
  });

  it("POST /auth/logout revokes the session, answers 204 no-store and expires the cookie", async () => {
    const issued = app.sessions.issueForTest(TEST_USER);
    const res = await app.request
      .post("/api/v1/auth/logout")
      .set(mutationHeaders({ cookie: cookieHeader(issued.cookieValue) }))
      .send({})
      .expect(204);
    expect(res.headers["cache-control"]).toBe("no-store");
    const setCookie = (res.headers["set-cookie"] as unknown as string[]).join(";");
    expect(setCookie).toMatch(/__Host-session=;/);
    expect(setCookie).toMatch(/Expires=Thu, 01 Jan 1970/);
    await app.request
      .get("/api/v1/auth/me")
      .set("cookie", cookieHeader(issued.cookieValue))
      .expect(401);
  });

  it("POST /auth/logout without a session is 401 (never a silent success)", async () => {
    await app.request.post("/api/v1/auth/logout").set(mutationHeaders()).send({}).expect(401);
  });

  it("ignores X-Forwarded-For when TRUSTED_PROXY_CIDRS is empty (default)", async () => {
    app.sessions.calls.length = 0;
    await app.request
      .post("/api/v1/auth/login")
      .set(mutationHeaders({ "x-forwarded-for": "198.51.100.7" }))
      .send({ email: TEST_USER.email, password: "correct horse battery staple" })
      .expect(401);
    const meta = app.sessions.calls.find((call) => call.method === "login")?.meta;
    expect(meta?.ip).not.toBe("198.51.100.7");
    expect(meta?.correlationId).toMatch(/^req_/);
  });
});

describe("auth routes behind a trusted proxy", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp({ env: testEnv({ TRUSTED_PROXY_CIDRS: "127.0.0.1, ::1" }) });
  });
  afterAll(() => app.close());

  it("takes the client IP from X-Forwarded-For only when the peer is a trusted proxy", async () => {
    await app.request
      .post("/api/v1/auth/login")
      .set(mutationHeaders({ "x-forwarded-for": "198.51.100.7" }))
      .send({ email: TEST_USER.email, password: "correct horse battery staple" })
      .expect(401);
    expect(app.sessions.calls.find((call) => call.method === "login")?.meta?.ip).toBe(
      "198.51.100.7",
    );
  });
});
