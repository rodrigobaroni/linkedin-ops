import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLogger, REDACTED, scrubSensitiveKeys } from "../src/logging/logger.js";
import {
  cookieHeader,
  createTestApp,
  LogCapture,
  mutationHeaders,
  TEST_USER,
  type TestApp,
} from "./helpers.js";

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

  it("scrubSensitiveKeys is recursive and leaves Error objects for the serializer", () => {
    const error = new Error("boom");
    const out = scrubSensitiveKeys({ a: { refreshToken: "x" }, err: error, ok: 1 }) as Record<
      string,
      unknown
    >;
    expect(out).toEqual({ a: { refreshToken: REDACTED }, err: error, ok: 1 });
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
