import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ProblemDetailsSchema } from "@linkedin-ops/contracts";
import {
  cookieHeader,
  createTestApp,
  mutationHeaders,
  TEST_USER,
  type TestApp,
} from "./helpers.js";
import { ElevatedProbeController, UnregisteredController } from "./probe.controllers.js";

/** Negative tests per control of ADR-0007 N4; `POST /auth/login` is the only mutation without a session. */
describe("RouteAccessGuard (ADR-0007 N4)", () => {
  let app: TestApp;
  const body = { email: "rodrigo@example.test", password: "correct horse battery staple" };

  beforeAll(async () => {
    app = await createTestApp({ controllers: [ElevatedProbeController, UnregisteredController] });
  });
  afterAll(() => app.close());

  async function expectCsrfRejected(headers: Record<string, string>, payload: unknown = body) {
    const res = await app.request
      .post("/api/v1/auth/login")
      .set(headers)
      .send(payload as object)
      .expect(403);
    expect(ProblemDetailsSchema.safeParse(res.body).success).toBe(true);
    expect(res.body.code).toBe("CSRF_REJECTED");
    expect(res.body.title).toBe("Requisição recusada por proteção CSRF");
    return res;
  }

  it("a well-formed login attempt passes every control (then fails on credentials, 401)", async () => {
    const res = await app.request
      .post("/api/v1/auth/login")
      .set(mutationHeaders())
      .send(body)
      .expect(401);
    expect(res.body.code).toBe("AUTH_INVALID_CREDENTIALS");
  });

  it("rejects a missing Origin", async () => {
    const { origin: _origin, ...headers } = mutationHeaders();
    await expectCsrfRejected(headers);
  });

  it('rejects "Origin: null"', async () => {
    await expectCsrfRejected(mutationHeaders({ origin: "null" }));
  });

  it("rejects an Origin that differs from APP_BASE_URL, even a sub-path or other scheme", async () => {
    await expectCsrfRejected(mutationHeaders({ origin: "https://evil.example.test" }));
    await expectCsrfRejected(mutationHeaders({ origin: "http://ops.example.test" }));
    await expectCsrfRejected(mutationHeaders({ origin: "https://ops.example.test.evil.test" }));
  });

  it("rejects cross-site Fetch Metadata even with a forged Origin", async () => {
    await expectCsrfRejected(mutationHeaders({ "sec-fetch-site": "cross-site" }));
    await expectCsrfRejected(mutationHeaders({ "sec-fetch-site": "same-site" }));
  });

  it("rejects form bodies (application/x-www-form-urlencoded and multipart) and text/plain", async () => {
    await expectCsrfRejected(
      mutationHeaders({ "content-type": "application/x-www-form-urlencoded" }),
      "email=a%40b.co&password=x",
    );
    await expectCsrfRejected(
      mutationHeaders({ "content-type": "multipart/form-data; boundary=x" }),
      "--x--",
    );
    await expectCsrfRejected(
      mutationHeaders({ "content-type": "text/plain" }),
      JSON.stringify(body),
    );
  });

  it("accepts application/json with a charset parameter", async () => {
    const res = await app.request
      .post("/api/v1/auth/login")
      .set(mutationHeaders({ "content-type": "application/json; charset=utf-8" }))
      .send(JSON.stringify(body))
      .expect(401);
    expect(res.body.code).toBe("AUTH_INVALID_CREDENTIALS");
  });

  it("rejects a missing or wrong X-Requested-With", async () => {
    const { "x-requested-with": _h, ...headers } = mutationHeaders();
    await expectCsrfRejected(headers);
    await expectCsrfRejected(mutationHeaders({ "x-requested-with": "XMLHttpRequest" }));
  });

  it("rejects method override headers and ?_method=", async () => {
    await expectCsrfRejected(mutationHeaders({ "x-http-method-override": "DELETE" }));
    await expectCsrfRejected(mutationHeaders({ "x-method-override": "PUT" }));
    const res = await app.request.get("/api/v1/health?_method=DELETE").expect(403);
    expect(res.body.code).toBe("CSRF_REJECTED");
    const viaHeader = await app.request
      .get("/api/v1/health")
      .set("x-http-method-override", "DELETE")
      .expect(403);
    expect(viaHeader.body.code).toBe("CSRF_REJECTED");
  });

  it("a mutation on a session route without a cookie → 401 AUTH_REQUIRED (CSRF controls first)", async () => {
    const res = await app.request
      .post("/api/v1/auth/reauth")
      .set(mutationHeaders())
      .send({ password: "correct horse battery staple" })
      .expect(401);
    expect(res.body.code).toBe("AUTH_REQUIRED");
    const csrf = await app.request
      .post("/api/v1/auth/reauth")
      .send({ password: "x".repeat(15) })
      .expect(403);
    expect(csrf.body.code).toBe("CSRF_REJECTED");
  });

  it("a GET on a session route without a cookie → 401; with an unknown cookie → 401; with a valid one → 200", async () => {
    await app.request.get("/api/v1/auth/me").expect(401);
    await app.request.get("/api/v1/auth/me").set("cookie", cookieHeader("unknown")).expect(401);
    const issued = app.sessions.issueForTest(TEST_USER);
    await app.request
      .get("/api/v1/auth/me")
      .set("cookie", cookieHeader(issued.cookieValue))
      .expect(200);
  });

  it("elevated routes require X-CSRF-Token bound to the session and a recent re-authentication", async () => {
    const plain = app.sessions.issueForTest(TEST_USER);
    const payload = { mode: "ASSISTED" };
    const headers = mutationHeaders({ cookie: cookieHeader(plain.cookieValue) });

    const noToken = await app.request
      .put("/api/v1/settings/autonomy")
      .set(headers)
      .send(payload)
      .expect(403);
    expect(noToken.body.code).toBe("CSRF_REJECTED");

    const wrongToken = await app.request
      .put("/api/v1/settings/autonomy")
      .set({ ...headers, "x-csrf-token": "not-the-token" })
      .send(payload)
      .expect(403);
    expect(wrongToken.body.code).toBe("CSRF_REJECTED");

    const notElevated = await app.request
      .put("/api/v1/settings/autonomy")
      .set({ ...headers, "x-csrf-token": plain.session.csrfToken })
      .send(payload)
      .expect(401);
    expect(notElevated.body.code).toBe("AUTH_REAUTH_REQUIRED");

    const elevated = app.sessions.issueForTest(TEST_USER, { elevated: true });
    await app.request
      .put("/api/v1/settings/autonomy")
      .set(
        mutationHeaders({
          cookie: cookieHeader(elevated.cookieValue),
          "x-csrf-token": elevated.session.csrfToken,
        }),
      )
      .send(payload)
      .expect(200);

    const editor = app.sessions.issueForTest(
      { ...TEST_USER, id: "0192f4a0-0000-7000-8000-000000000002", role: "EDITOR" },
      { elevated: true },
    );
    const forbidden = await app.request
      .put("/api/v1/settings/autonomy")
      .set(
        mutationHeaders({
          cookie: cookieHeader(editor.cookieValue),
          "x-csrf-token": editor.session.csrfToken,
        }),
      )
      .send(payload)
      .expect(403);
    expect(forbidden.body.code).toBe("FORBIDDEN");
  });

  it("routes outside the registry default to session (fail closed)", async () => {
    const res = await app.request.get("/api/v1/__probe/unregistered").expect(401);
    expect(res.body.code).toBe("AUTH_REQUIRED");
    const issued = app.sessions.issueForTest(TEST_USER);
    await app.request
      .get("/api/v1/__probe/unregistered")
      .set("cookie", cookieHeader(issued.cookieValue))
      .expect(200);
  });
});
