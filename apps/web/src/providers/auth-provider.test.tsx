import { CSRF_TOKEN_HEADER, routesV1 } from "@linkedin-ops/contracts";
import { act, renderHook, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { useReauth } from "@/hooks/use-reauth";
import { messages } from "@/i18n/pt-br";
import { isApiProblem } from "@/lib/api";
import {
  MOCK_CREDENTIALS,
  mockAuthState,
  problemResponse,
  requireElevated,
  resetMockAuth,
} from "@/mocks/auth-handlers";
import { server } from "@/mocks/node";
import { AppProviders } from "@/providers/app-providers";
import { useAuth } from "@/providers/auth-provider";

const wrapper = ({ children }: { children: ReactNode }) => <AppProviders>{children}</AppProviders>;

function renderAuth(loggedIn: boolean) {
  resetMockAuth({ loggedIn });
  return renderHook(() => ({ auth: useAuth(), reauth: useReauth() }), { wrapper });
}

async function settled(result: { current: { auth: { status: string } } }) {
  await waitFor(() => expect(result.current.auth.status).not.toBe("loading"));
}

/** A 🔐 endpoint for tests: elevated session + session-bound token, echoing the token it saw. */
function elevatedEcho() {
  return http.post("/api/v1/integrations/linkedin/connect", ({ request, cookies }) => {
    const rejection = requireElevated(request, cookies);
    if (rejection) return rejection;
    return HttpResponse.json({
      authorizeUrl: `https://example.test/?t=${request.headers.get(CSRF_TOKEN_HEADER)}`,
    });
  });
}

describe("AuthProvider", () => {
  it("is anonymous without a session and authenticated after login; token never touches storage", async () => {
    const { result } = renderAuth(false);
    await settled(result);
    expect(result.current.auth.status).toBe("anonymous");
    expect(result.current.auth.user).toBeNull();

    await act(() => result.current.auth.login({ ...MOCK_CREDENTIALS }));
    await waitFor(() => expect(result.current.auth.status).toBe("authenticated"));
    expect(result.current.auth.user).toMatchObject({ name: "Rodrigo", role: "OWNER" });
    expect(result.current.auth.elevatedUntil).toBeNull();

    const token = mockAuthState().csrfToken;
    expect(token).toMatch(/^mock-/);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.cookie).not.toContain(token);
    expect(location.href).not.toContain(token);
    expect(JSON.stringify(result.current.auth)).not.toContain(token);
  });

  it("rejects wrong credentials with a generic problem and stays anonymous", async () => {
    const { result } = renderAuth(false);
    await settled(result);
    const error = await act(() =>
      result.current.auth
        .login({ email: MOCK_CREDENTIALS.email, password: "x".repeat(15) })
        .catch((e: unknown) => e),
    );
    expect(isApiProblem(error, "AUTH_INVALID_CREDENTIALS")).toBe(true);
    expect(result.current.auth.status).toBe("anonymous");
  });

  it("logs out: session revoked on the API and local state dropped", async () => {
    const { result } = renderAuth(true);
    await settled(result);
    expect(result.current.auth.status).toBe("authenticated");
    await act(() => result.current.auth.logout());
    await waitFor(() => expect(result.current.auth.status).toBe("anonymous"));
    expect(mockAuthState().loggedIn).toBe(false);
  });

  it("drops the local session even when POST /auth/logout fails", async () => {
    server.use(http.post("/api/v1/auth/logout", () => problemResponse("UPSTREAM_UNAVAILABLE")));
    const { result } = renderAuth(true);
    await settled(result);
    await expect(act(() => result.current.auth.logout())).rejects.toMatchObject({
      code: "UPSTREAM_UNAVAILABLE",
    });
    await waitFor(() => expect(result.current.auth.status).toBe("anonymous"));
  });

  it("is unavailable (not anonymous) when the API is down, and recovers on refresh", async () => {
    server.use(http.get("/api/v1/auth/me", () => HttpResponse.error()));
    const { result } = renderAuth(true);
    await settled(result);
    expect(result.current.auth.status).toBe("unavailable");
    server.resetHandlers();
    await act(() => result.current.auth.refresh());
    await waitFor(() => expect(result.current.auth.status).toBe("authenticated"));
  });

  it("reauth elevates the session and the rotated token is used on 🔐 calls", async () => {
    server.use(elevatedEcho());
    const { result } = renderAuth(true);
    await settled(result);
    const before = mockAuthState().csrfToken;

    await expect(
      result.current.auth.client.request(routesV1["integrations.linkedin.connect"]),
    ).rejects.toMatchObject({ code: "AUTH_REAUTH_REQUIRED" });

    await act(() => result.current.auth.reauth({ password: MOCK_CREDENTIALS.password }));
    await waitFor(() => expect(result.current.reauth.isElevated).toBe(true));
    const after = mockAuthState().csrfToken;
    expect(after).not.toBe(before);

    const response = await result.current.auth.client.request(
      routesV1["integrations.linkedin.connect"],
    );
    expect(response.authorizeUrl).toBe(`https://example.test/?t=${after}`);
  });

  it("recovers from a stale token: 403 CSRF_REJECTED → GET /auth/me → retry once", async () => {
    server.use(elevatedEcho());
    const { result } = renderAuth(true);
    await settled(result);
    await act(() => result.current.auth.reauth({ password: MOCK_CREDENTIALS.password }));
    // Another tab rotated the session: the API now expects a token this client never saw.
    resetMockAuth({ loggedIn: true, elevatedUntil: Date.now() + 60_000 });
    const expected = mockAuthState().csrfToken;

    const response = await result.current.auth.client.request(
      routesV1["integrations.linkedin.connect"],
    );
    expect(response.authorizeUrl).toBe(`https://example.test/?t=${expected}`);
  });

  it("withElevation opens the password dialog, retries after confirmation and resolves undefined on cancel", async () => {
    server.use(elevatedEcho());
    const { result } = renderAuth(true);
    await settled(result);
    const run = () => result.current.auth.client.request(routesV1["integrations.linkedin.connect"]);

    // Cancel.
    let promise = result.current.reauth.withElevation(run);
    const dialog = await screen.findByRole("dialog", { name: messages.auth.reauth.title });
    await userEvent.click(screen.getByRole("button", { name: messages.auth.reauth.cancel }));
    await expect(promise).resolves.toBeUndefined();
    await waitFor(() => expect(dialog).not.toBeInTheDocument());

    // Wrong password keeps the dialog open with an error; the right one completes the action.
    promise = result.current.reauth.withElevation(run);
    await screen.findByRole("dialog", { name: messages.auth.reauth.title });
    const password = screen.getByLabelText(/Senha/);
    await userEvent.type(password, "wrong-password-123456");
    await userEvent.click(screen.getByRole("button", { name: messages.auth.reauth.confirm }));
    expect(await screen.findByRole("alert")).toHaveTextContent(messages.auth.reauth.invalid);
    expect(password).toHaveValue("wrong-password-123456");

    await userEvent.clear(password);
    await userEvent.type(password, MOCK_CREDENTIALS.password);
    await userEvent.click(screen.getByRole("button", { name: messages.auth.reauth.confirm }));
    const response = await promise;
    expect(response?.authorizeUrl).toContain(mockAuthState().csrfToken);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    // Already elevated: no dialog.
    const second = await result.current.reauth.withElevation(run);
    expect(second?.authorizeUrl).toContain(mockAuthState().csrfToken);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
