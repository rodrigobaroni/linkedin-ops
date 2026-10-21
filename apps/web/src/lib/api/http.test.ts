import {
  CSRF_TOKEN_HEADER,
  ERROR_CODE_HTTP_STATUS,
  type ErrorCode,
  PROBLEM_CONTENT_TYPE,
  problemTypeFor,
  routesV1,
} from "@linkedin-ops/contracts";
import { describe, expect, it, vi } from "vitest";
import { CsrfTokenStore } from "./csrf-token-store";
import { buildPath, createApiClient } from "./http";
import { ApiNetworkError, ApiProblem, parseRetryAfter } from "./problem";

const ME = {
  id: "0199a3f2-0000-7000-8000-000000000001",
  email: "rodrigo@example.com",
  name: "Rodrigo",
  role: "OWNER",
  locale: "pt-BR",
  timezone: "America/Sao_Paulo",
  linkedinConnected: false,
  csrfToken: "token-from-body-0123456789abcdef0123456789",
  elevatedUntil: null,
};

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function problem(code: ErrorCode, headers: Record<string, string> = {}): Response {
  const status = ERROR_CODE_HTTP_STATUS[code];
  return new Response(
    JSON.stringify({ type: problemTypeFor(code), title: code, status, code, correlationId: "c-1" }),
    { status, headers: { "Content-Type": PROBLEM_CONTENT_TYPE, ...headers } },
  );
}

function setup(responses: Response[], token: string | null = null) {
  const tokenStore = new CsrfTokenStore();
  if (token) tokenStore.set(token);
  const fetchMock = vi.fn<typeof fetch>(async () => {
    const next = responses.shift();
    if (!next) throw new Error("no response queued");
    return next;
  });
  const refreshCsrfToken = vi.fn(async () => {
    tokenStore.set("refreshed-token-0123456789abcdef0123456789");
  });
  const client = createApiClient({ tokenStore, fetch: fetchMock, refreshCsrfToken });
  return { client, fetchMock, tokenStore, refreshCsrfToken };
}

function requestOf(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>, call = 0) {
  const [url, init] = fetchMock.mock.calls[call]!;
  return { url: String(url), init: init!, headers: new Headers(init!.headers) };
}

describe("createApiClient", () => {
  it("sends the cookie and only Accept on GET", async () => {
    const { client, fetchMock } = setup([json(ME)]);
    await client.request(routesV1["auth.me"]);
    const { url, init, headers } = requestOf(fetchMock);
    expect(url).toBe("http://localhost:3000/api/v1/auth/me");
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("include");
    expect(init.body).toBeUndefined();
    expect(headers.get("Accept")).toBe("application/json");
    expect(headers.has("Content-Type")).toBe(false);
    expect(headers.has("X-Requested-With")).toBe(false);
    expect(headers.has(CSRF_TOKEN_HEADER)).toBe(false);
  });

  it("sends JSON + X-Requested-With on every mutation, without the CSRF token on session routes", async () => {
    const { client, fetchMock } = setup([new Response(null, { status: 204 })], "stored-token");
    const result = await client.request(routesV1["auth.logout"]);
    expect(result).toBeUndefined();
    const { init, headers } = requestOf(fetchMock);
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(init.body).toBe("{}");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("X-Requested-With")).toBe("linkedin-ops");
    expect(headers.has(CSRF_TOKEN_HEADER)).toBe(false);
  });

  it("adds X-CSRF-Token on elevated routes and when asked explicitly", async () => {
    const { client, fetchMock } = setup(
      [json({ authorizeUrl: "https://www.linkedin.com/oauth" }), json(ME)],
      "stored-token",
    );
    await client.request(routesV1["integrations.linkedin.connect"]);
    expect(requestOf(fetchMock, 0).headers.get(CSRF_TOKEN_HEADER)).toBe("stored-token");
    await client.request(routesV1["auth.me"], { csrf: true });
    expect(requestOf(fetchMock, 1).headers.get(CSRF_TOKEN_HEADER)).toBe("stored-token");
  });

  it("stores the rotated token from the X-CSRF-Token response header", async () => {
    const { client, tokenStore } = setup([
      json(ME, { headers: { "Content-Type": "application/json", [CSRF_TOKEN_HEADER]: "rotated" } }),
    ]);
    await client.request(routesV1["auth.me"]);
    expect(tokenStore.get()).toBe("rotated");
  });

  it("on 403 CSRF_REJECTED refreshes the token and retries exactly once", async () => {
    const { client, fetchMock, refreshCsrfToken } = setup(
      [problem("CSRF_REJECTED"), json({ authorizeUrl: "https://www.linkedin.com/oauth" })],
      "stale-token",
    );
    await client.request(routesV1["integrations.linkedin.connect"]);
    expect(refreshCsrfToken).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestOf(fetchMock, 1).headers.get(CSRF_TOKEN_HEADER)).toBe(
      "refreshed-token-0123456789abcdef0123456789",
    );
  });

  it("surfaces the second CSRF_REJECTED instead of looping", async () => {
    const { client, fetchMock, refreshCsrfToken } = setup(
      [problem("CSRF_REJECTED"), problem("CSRF_REJECTED")],
      "stale-token",
    );
    await expect(client.request(routesV1["integrations.linkedin.connect"])).rejects.toMatchObject({
      name: "ApiProblem",
      code: "CSRF_REJECTED",
      status: 403,
    });
    expect(refreshCsrfToken).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("propagates the refresh failure (e.g. session gone) without retrying", async () => {
    const tokenStore = new CsrfTokenStore();
    const fetchMock = vi.fn<typeof fetch>(async () => problem("CSRF_REJECTED"));
    const client = createApiClient({
      tokenStore,
      fetch: fetchMock,
      refreshCsrfToken: async () => {
        throw new ApiProblem({ code: "AUTH_REQUIRED", status: 401, title: "x" });
      },
    });
    await expect(client.request(routesV1["auth.logout"])).rejects.toMatchObject({
      code: "AUTH_REQUIRED",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("parses Problem Details with Retry-After", async () => {
    const { client } = setup([problem("RATE_LIMITED", { "Retry-After": "900" })]);
    const error = await client
      .request(routesV1["auth.login"], { body: { email: "a@b.co", password: "x".repeat(15) } })
      .catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ApiProblem);
    expect(error).toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
      correlationId: "c-1",
      retryAfterSeconds: 900,
    });
  });

  it("maps a non-Problem error body (proxy HTML) to a code by status", async () => {
    const { client } = setup([
      new Response("<html>Bad Gateway</html>", {
        status: 503,
        headers: { "Content-Type": "text/html" },
      }),
    ]);
    await expect(client.request(routesV1["auth.me"])).rejects.toMatchObject({
      code: "UPSTREAM_UNAVAILABLE",
      status: 503,
    });
  });

  it("wraps fetch failures in ApiNetworkError", async () => {
    const tokenStore = new CsrfTokenStore();
    const client = createApiClient({
      tokenStore,
      fetch: async () => {
        throw new TypeError("Failed to fetch");
      },
      refreshCsrfToken: async () => {},
    });
    await expect(client.request(routesV1["auth.me"])).rejects.toBeInstanceOf(ApiNetworkError);
  });

  it("rejects a 2xx body that violates the contract", async () => {
    const { client } = setup([json({ ...ME, csrfToken: "short" })]);
    await expect(client.request(routesV1["auth.me"])).rejects.toMatchObject({ code: "INTERNAL" });
  });

  it("encodes path params", () => {
    expect(buildPath("/auth/sessions/{id}", { id: "a b/c" })).toBe("/auth/sessions/a%20b%2Fc");
    expect(() => buildPath("/auth/sessions/{id}")).toThrow(/Missing path param/);
  });
});

describe("parseRetryAfter", () => {
  it("accepts integer seconds, HTTP dates, and rejects garbage", () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter("900")).toBe(900);
    expect(parseRetryAfter(" 42 ")).toBe(42);
    const now = Date.parse("2026-10-21T12:00:00Z");
    expect(parseRetryAfter("Wed, 21 Oct 2026 12:05:00 GMT", now)).toBe(300);
    expect(parseRetryAfter("soon")).toBeUndefined();
  });
});

describe("CsrfTokenStore", () => {
  it("never serializes the token", () => {
    const store = new CsrfTokenStore();
    store.set("secret-token");
    expect(JSON.stringify({ store })).toBe('{"store":null}');
    expect(Object.keys(store)).toEqual([]);
    store.clear();
    expect(store.get()).toBeNull();
  });
});
