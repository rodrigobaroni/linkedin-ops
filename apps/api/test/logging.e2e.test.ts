import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CIRCULAR,
  createLogger,
  QUERY_OMITTED,
  REDACTED,
  scrubSensitiveKeys,
  TRUNCATED,
} from "../src/logging/logger.js";
import {
  cookieHeader,
  createTestApp,
  LogCapture,
  mutationHeaders,
  TEST_USER,
  type TestApp,
} from "./helpers.js";
import { DatabaseError, PrismaClientKnownRequestError, ROW_CANARY } from "./fixtures/db-errors.js";

describe("Pino redaction and auth bodies never logged", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it("redacts authorization, cookie, token, apiKey, csrfToken and password wherever they are logged", () => {
    const logs = new LogCapture();
    const logger = createLogger({ level: "info", pretty: false, stream: logs.stream });
    logger.info(
      {
        authorization: "Bearer SECRET-A",
        cookie: "__Host-session=SECRET-B",
        token: "SECRET-C",
        apiKey: "SECRET-D",
        csrfToken: "SECRET-E",
        password: "SECRET-F",
        nested: {
          deeper: { accessToken: "SECRET-G", clientSecret: "SECRET-H", csrfToken: "SECRET-I" },
        },
        list: [{ apiKey: "SECRET-J" }],
        req: {
          headers: { authorization: "SECRET-K", cookie: "SECRET-L", "x-csrf-token": "SECRET-M" },
        },
        safe: "visible",
        usage: { inputTokens: 3 },
      },
      "probe",
    );
    const text = logs.text;
    for (const marker of "ABCDEFGHIJKLM".split("")) expect(text).not.toContain(`SECRET-${marker}`);
    expect(text).toContain("visible");
    expect(text).toContain(REDACTED);
    expect(text).toContain('"inputTokens":3');
  });

  it("scrubSensitiveKeys is recursive and reduces Error objects to their allow-listed fields (#102)", () => {
    const error = new Error("boom");
    const out = scrubSensitiveKeys({ a: { refreshToken: "x" }, e: error, ok: 1 }) as Record<
      string,
      unknown
    >;
    expect(out).toEqual({
      a: { refreshToken: REDACTED },
      e: { type: "Error", message: "boom", stack: expect.stringMatching(/^Error: boom\n/) },
      ok: 1,
    });
  });

  it("never logs a raw error under any key, nested or not (#102)", () => {
    const logs = new LogCapture();
    const logger = createLogger({ level: "info", pretty: false, stream: logs.stream });
    logger.error({ exception: new DatabaseError() }, "pg failed");
    logger.error({ ctx: { err: new PrismaClientKnownRequestError(), step: "x" } }, "nested");
    logger.error({ e: new PrismaClientKnownRequestError() }, "short key");
    logger.error({ list: [new DatabaseError()], error: new DatabaseError() }, "array and error");
    logger.error(new PrismaClientKnownRequestError(), "error as the merging object");
    expect(logs.lines).toHaveLength(5);
    expect(logs.lines[0]?.["exception"]).toMatchObject({ type: "DatabaseError", code: "23505" });
    expect(logs.lines[1]?.["ctx"]).toMatchObject({
      err: { type: "PrismaClientKnownRequestError", code: "P2010" },
      step: "x",
    });
    expect(logs.lines[2]?.["e"]).toMatchObject({ type: "PrismaClientKnownRequestError" });
    expect(logs.lines[3]?.["error"]).toMatchObject({ type: "DatabaseError" });
    expect(logs.lines[4]?.["err"]).toMatchObject({ type: "PrismaClientKnownRequestError" });
    for (const leak of [ROW_CANARY, "driverAdapterError", '"detail"', '"meta"', '"table"']) {
      expect(logs.text).not.toContain(leak);
    }
  });

  it("request logs drop the query string, so csrfToken, OAuth code/state and tokens never reach the log", async () => {
    const canaries = {
      csrfToken: "QA81-CANARY-CSRF",
      token: "QA81-CANARY-TOKEN",
      code: "QA81-CANARY-CODE",
      state: "QA81-CANARY-STATE",
      access_token: "QA81-CANARY-ACCESS",
      refresh_token: "QA81-CANARY-REFRESH",
    };
    const query = new URLSearchParams(canaries).toString();
    await app.request.get(`/api/v1/health?${query}`).expect(200);
    const text = app.logs.text;
    for (const value of Object.values(canaries)) expect(text).not.toContain(value);
    expect(text).toContain(`"url":"/api/v1/health?${QUERY_OMITTED}"`);
  });

  it("scrubSensitiveKeys fails closed beyond the depth limit, inside arrays and on cycles", () => {
    let deep: Record<string, unknown> = {
      csrfToken: "QA81-DEEP-CSRF",
      accessToken: "QA81-DEEP-ACCESS",
    };
    for (let level = 0; level < 8; level += 1) deep = { level, child: deep };
    const cyclic: Record<string, unknown> = { name: "loop" };
    cyclic["self"] = cyclic;
    const logs = new LogCapture();
    const logger = createLogger({ level: "info", pretty: false, stream: logs.stream });
    logger.info(
      { deep, list: [[{ clientSecret: "QA81-ARRAY-SECRET" }]], cyclic, safe: "visible" },
      "probe",
    );
    const text = logs.text;
    for (const value of ["QA81-DEEP-CSRF", "QA81-DEEP-ACCESS", "QA81-ARRAY-SECRET"]) {
      expect(text).not.toContain(value);
    }
    expect(text).toContain(TRUNCATED);
    expect(text).toContain(CIRCULAR);
    expect(text).toContain("visible");
  });

  it("request logs carry method, url, status and correlationId but no headers, cookies or bodies", async () => {
    const issued = app.sessions.issueForTest(TEST_USER);
    const me = await app.request
      .get("/api/v1/auth/me")
      .set("cookie", cookieHeader(issued.cookieValue))
      .expect(200);
    await app.request
      .post("/api/v1/auth/login")
      .set(mutationHeaders())
      .send({ email: "rodrigo@example.test", password: "hunter2hunter2hunter2" })
      .expect(401);
    const text = app.logs.text;
    expect(text).toContain(me.headers["x-correlation-id"]);
    expect(text).toContain('"url":"/api/v1/auth/me"');
    expect(text).not.toContain(issued.cookieValue);
    expect(text).not.toContain(issued.session.csrfToken);
    expect(text).not.toContain("hunter2hunter2hunter2");
    expect(text).not.toContain("rodrigo@example.test");
    expect(text).not.toContain('"headers"');
    expect(text).not.toContain('"body"');
  });
});
