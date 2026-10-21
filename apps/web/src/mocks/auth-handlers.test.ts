import { describe, expect, it } from "vitest";
import { MOCK_CREDENTIALS, mockAuthState, resetMockAuth } from "./auth-handlers";

const headers = { "Content-Type": "application/json", "X-Requested-With": "linkedin-ops" };

async function login(password: string): Promise<Response> {
  return fetch("http://localhost:3000/api/v1/auth/login", {
    method: "POST",
    headers,
    body: JSON.stringify({ email: MOCK_CREDENTIALS.email, password }),
  });
}

describe("auth mock", () => {
  it("rejects mutations without the N4 headers", async () => {
    const response = await fetch("http://localhost:3000/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: MOCK_CREDENTIALS.email, password: MOCK_CREDENTIALS.password }),
    });
    expect(response.status).toBe(403);
    expect(response.headers.get("Content-Type")).toContain("application/problem+json");
    await expect(response.json()).resolves.toMatchObject({ code: "CSRF_REJECTED" });
  });

  it("locks for 15 minutes after 5 failures in a minute, with an integer Retry-After", async () => {
    resetMockAuth();
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await login("wrong-password-123456");
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({ code: "AUTH_INVALID_CREDENTIALS" });
    }
    const fifth = await login("wrong-password-123456");
    expect(fifth.status).toBe(429);
    expect(fifth.headers.get("Retry-After")).toBe("900");
    const locked = await login(MOCK_CREDENTIALS.password);
    expect(locked.status).toBe(429);
    expect(Number(locked.headers.get("Retry-After"))).toBeLessThanOrEqual(900);
    expect(mockAuthState().loggedIn).toBe(false);
  });

  it("answers login with the token in body and header, Cache-Control: no-store", async () => {
    const response = await login(MOCK_CREDENTIALS.password);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = (await response.json()) as { csrfToken: string; elevatedUntil: null };
    expect(body.elevatedUntil).toBeNull();
    expect(response.headers.get("X-CSRF-Token")).toBe(body.csrfToken);
    expect(body.csrfToken).toBe(mockAuthState().csrfToken);
  });
});
