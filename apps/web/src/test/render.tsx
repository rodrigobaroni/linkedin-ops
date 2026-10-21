import { type RenderResult, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MOCK_ELEVATION_MS, resetMockAuth } from "@/mocks/auth-handlers";
import { AppProviders } from "@/providers/app-providers";
import { useAuth } from "@/providers/auth-provider";

/** Exposes the session status so tests can wait for `GET /auth/me` to settle. */
function AuthStatusProbe() {
  const { status } = useAuth();
  return <span hidden data-testid="auth-status" data-status={status} />;
}

export type RenderAppOptions = {
  /** Whether the mocked API has a session for the first `GET /auth/me`. */
  loggedIn?: boolean;
  /** Skip waiting for the session check (e.g. to assert the loading state). */
  settle?: boolean;
  /** Start with an elevated session (🔐 actions run without the reauth dialog). */
  elevated?: boolean;
};

/** Renders inside `AppProviders` (query client, auth, tooltips) against the MSW auth mock. */
export async function renderApp(
  ui: ReactNode,
  { loggedIn = true, settle = true, elevated = false }: RenderAppOptions = {},
): Promise<RenderResult> {
  resetMockAuth({ loggedIn, elevatedUntil: elevated ? Date.now() + MOCK_ELEVATION_MS : null });
  const result = render(
    <AppProviders>
      {ui}
      <AuthStatusProbe />
    </AppProviders>,
  );
  if (settle) await waitForSession();
  return result;
}

export async function waitForSession(expected?: string): Promise<void> {
  await waitFor(() => {
    const status = screen.getByTestId("auth-status").dataset["status"];
    if (status === "loading" || (expected !== undefined && status !== expected)) {
      throw new Error(`auth status is ${status}`);
    }
  });
}
