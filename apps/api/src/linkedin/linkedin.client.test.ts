import { describe, expect, it } from "vitest";
import { ProblemError } from "../common/problem.error.js";
import { FixedWindowLimiter } from "./fixed-window-limiter.js";
import {
  classifyPostResponse,
  LinkedInApiError,
  LinkedInApiClient,
  type FetchLike,
} from "./linkedin.client.js";

const CONFIG = {
  clientId: "client-id",
  clientSecret: "client-secret-value",
  redirectUri: "https://ops.example.test/api/v1/auth/linkedin/callback",
  pkce: "disabled" as const,
};
const ACCESS_TOKEN = "AQV-access-token-never-logged";

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function clientWith(handler: FetchLike) {
  const calls: { url: string; init: RequestInit }[] = [];
  const client = new LinkedInApiClient(async (url, init) => {
    calls.push({ url, init });
    return handler(url, init);
  }, CONFIG);
  return { client, calls };
}

describe("classifyPostResponse (ADR-0003)", () => {
  it.each([
    [201, "urn:li:share:7380000000000000000", "succeeded"],
    [201, "urn:li:ugcPost:7380000000000000001", "succeeded"],
    [201, null, "ambiguous"],
    [201, "urn:li:share:<script>", "ambiguous"],
    [500, null, "ambiguous"],
    [503, null, "ambiguous"],
    [302, null, "ambiguous"],
    [400, null, "failed"],
    [422, null, "failed"],
    [401, null, "failed"],
    [403, null, "failed"],
    [429, null, "failed"],
  ])("HTTP %i with x-restli-id %s → %s", (status, restliId, kind) => {
    expect(classifyPostResponse(status, restliId).kind).toBe(kind);
  });

  it("401/403 require reconnecting; 429 and other 4xx do not", () => {
    expect(classifyPostResponse(401, null)).toMatchObject({
      reauth: true,
      code: "LINKEDIN_UNAUTHORIZED",
    });
    expect(classifyPostResponse(403, null)).toMatchObject({
      reauth: true,
      code: "LINKEDIN_FORBIDDEN",
    });
    expect(classifyPostResponse(429, null)).toMatchObject({
      reauth: false,
      code: "LINKEDIN_RATE_LIMITED",
    });
    expect(classifyPostResponse(422, null)).toMatchObject({
      reauth: false,
      code: "LINKEDIN_REJECTED",
    });
  });
});

describe("LinkedInApiClient", () => {
  it("exchanges the code with the byte-identical redirect URI and never follows redirects", async () => {
    const { client, calls } = clientWith(async () =>
      json(200, {
        access_token: ACCESS_TOKEN,
        expires_in: 5_183_999,
        scope: "openid,profile,w_member_social",
      }),
    );
    const grant = await client.exchangeCode("the-code");
    expect(grant).toEqual({
      accessToken: ACCESS_TOKEN,
      expiresInSeconds: 5_183_999,
      scopes: ["openid", "profile", "w_member_social"],
      idToken: null,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://www.linkedin.com/oauth/v2/accessToken");
    expect(calls[0]?.init.redirect).toBe("manual");
    const form = new URLSearchParams(String(calls[0]?.init.body));
    expect(Object.fromEntries(form)).toEqual({
      grant_type: "authorization_code",
      code: "the-code",
      redirect_uri: CONFIG.redirectUri,
      client_id: CONFIG.clientId,
      client_secret: CONFIG.clientSecret,
    });
    expect(form.has("code_verifier")).toBe(false);
  });

  it("rejects token responses that are not JSON, lack the token or carry an oversized one", async () => {
    for (const response of [
      new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }),
      json(200, { expires_in: 10 }),
      json(200, { access_token: "x".repeat(4097), expires_in: 10 }),
      json(200, { access_token: ACCESS_TOKEN, expires_in: -1 }),
    ]) {
      const { client } = clientWith(async () => response);
      await expect(client.exchangeCode("c")).rejects.toMatchObject({
        code: "TOKEN_RESPONSE_INVALID",
      });
    }
    const { client } = clientWith(async () => json(400, { error: "invalid_grant" }));
    await expect(client.exchangeCode("c")).rejects.toMatchObject({
      code: "TOKEN_EXCHANGE_FAILED",
      httpStatus: 400,
    });
  });

  it("validates userinfo.sub and strips control characters from the display name", async () => {
    const { client } = clientWith(async () =>
      json(200, { sub: "abc_DEF-123", name: "Rodrigo\u001b[31m Baroni" }),
    );
    await expect(client.userinfo(ACCESS_TOKEN)).resolves.toEqual({
      sub: "abc_DEF-123",
      name: "Rodrigo[31m Baroni",
    });
    const bad = clientWith(async () => json(200, { sub: "../../etc", name: "x" }));
    await expect(bad.client.userinfo(ACCESS_TOKEN)).rejects.toMatchObject({
      code: "USERINFO_INVALID",
    });
  });

  it("posts text with the pinned headers and little-text escaping", async () => {
    const { client, calls } = clientWith(
      async () => new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:1" } }),
    );
    const outcome = await client.createTextPost(
      ACCESS_TOKEN,
      "urn:li:person:abc",
      "Olá (mundo) #tag @x",
    );
    expect(outcome).toEqual({ kind: "succeeded", postUrn: "urn:li:share:1" });
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers["linkedin-version"]).toMatch(/^\d{6}$/);
    expect(headers["x-restli-protocol-version"]).toBe("2.0.0");
    expect(headers.authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      author: "urn:li:person:abc",
      commentary: "Olá \\(mundo\\) \\#tag \\@x",
      visibility: "PUBLIC",
      lifecycleState: "PUBLISHED",
    });
  });

  it("turns a timeout or network failure on the post into AMBIGUOUS (never a throw, never a retry)", async () => {
    for (const [name, code] of [
      ["TimeoutError", "TIMEOUT"],
      ["TypeError", "NETWORK_ERROR"],
    ] as const) {
      const { client, calls } = clientWith(async () => {
        const error = new Error("boom");
        error.name = name;
        throw error;
      });
      await expect(client.createTextPost(ACCESS_TOKEN, "urn:li:person:abc", "t")).resolves.toEqual({
        kind: "ambiguous",
        code,
        httpStatus: null,
      });
      expect(calls).toHaveLength(1);
    }
  });

  it("errors never carry the token, the code or the client secret", async () => {
    const { client } = clientWith(async () => json(401, { message: ACCESS_TOKEN }));
    const error = (await client
      .userinfo(ACCESS_TOKEN)
      .catch((caught: unknown) => caught)) as LinkedInApiError;
    expect(error).toBeInstanceOf(LinkedInApiError);
    expect(`${error.message} ${JSON.stringify(error)}`).not.toContain(ACCESS_TOKEN);
    expect(`${error.message} ${JSON.stringify(error)}`).not.toContain(CONFIG.clientSecret);
  });
});

describe("FixedWindowLimiter", () => {
  it("allows `limit` hits per window, then 429 with Retry-After, then resets", () => {
    let now = 1_000_000;
    const limiter = new FixedWindowLimiter(2, 60_000, () => now);
    limiter.consume("u", "x");
    limiter.consume("u", "x");
    limiter.consume("other", "x");
    const error = (() => {
      try {
        limiter.consume("u", "x");
      } catch (caught) {
        return caught;
      }
      return null;
    })() as ProblemError;
    expect(error).toBeInstanceOf(ProblemError);
    expect(error.code).toBe("RATE_LIMITED");
    expect(error.headers["Retry-After"]).toBe("60");
    now += 60_000;
    expect(() => limiter.consume("u", "x")).not.toThrow();
  });
});
