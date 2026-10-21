"use client";

import type { LoginInput, ReauthInput } from "@linkedin-ops/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from "react";
import { ReauthDialog } from "@/components/auth/reauth-dialog";
import { messages } from "@/i18n/pt-br";
import {
  type ApiClient,
  CsrfTokenStore,
  type SessionSnapshot,
  type SessionUser,
  createApiClient,
  createAuthApi,
  isApiProblem,
} from "@/lib/api";
import { formatClock, minutesUntil } from "@/lib/format-duration";

export const SESSION_QUERY_KEY = ["auth", "me"] as const;

export type AuthStatus = "loading" | "authenticated" | "anonymous" | "unavailable";

export type AuthContextValue = {
  status: AuthStatus;
  user: SessionUser | null;
  /** ISO instant until which the session is elevated (ADR-0007 item 3), or `null`. */
  elevatedUntil: string | null;
  /** Error that made the session check fail for a reason other than "no session". */
  error: unknown;
  /** Typed client for every other feature: cookie, mandatory headers and CSRF handling included. */
  client: ApiClient;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  reauth: (input: ReauthInput) => Promise<void>;
  /** Re-runs `GET /auth/me` (also refreshes the CSRF token). */
  refresh: () => Promise<void>;
  /** Opens the password dialog unless the session is already elevated; resolves `true` on success. */
  ensureElevated: () => Promise<boolean>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** Everything except the session query itself (whose observer must survive login/logout). */
function isNotSessionQuery(query: { queryKey: readonly unknown[] }): boolean {
  return query.queryKey[0] !== SESSION_QUERY_KEY[0];
}

function isElevated(elevatedUntil: string | null, now = Date.now()): boolean {
  return elevatedUntil !== null && Date.parse(elevatedUntil) > now;
}

/**
 * Session state for the whole app. The CSRF token lives in a `CsrfTokenStore` held here (memory only,
 * ADR-0007 N2) and is never part of React state or the query cache: `authApi` strips it before
 * returning. `GET /auth/me` decides between authenticated / anonymous (any `401`) / unavailable
 * (network error, 5xx or another unexpected answer, e.g. the API is down).
 */
export function AuthProvider({
  children,
  fetch: fetchImpl,
}: {
  children: ReactNode;
  fetch?: typeof fetch;
}) {
  const queryClient = useQueryClient();
  const [{ client, authApi }] = useState(() => {
    const tokenStore = new CsrfTokenStore();
    // `refreshCsrfToken` runs on `403 CSRF_REJECTED`; `me()` stores the current token as a side effect.
    const apiClient = createApiClient({
      tokenStore,
      fetch: fetchImpl,
      refreshCsrfToken: async () => {
        await api.me();
      },
    });
    const api = createAuthApi(apiClient, tokenStore);
    return { client: apiClient, authApi: api };
  });

  const session = useQuery<SessionSnapshot | null>({
    queryKey: SESSION_QUERY_KEY,
    queryFn: async ({ signal }) => {
      try {
        return await authApi.me(signal);
      } catch (error) {
        // Any 401 means "no valid session" → anonymous + /login. Only network errors and 5xx (and other
        // unexpected answers) make the check "unavailable".
        if (isApiProblem(error) && error.status === 401) return null;
        throw error;
      }
    },
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const [elevationRequest, setElevationRequest] = useState<{
    resolve: (elevated: boolean) => void;
  } | null>(null);

  const refresh = useCallback(async () => {
    await session.refetch({ throwOnError: false });
  }, [session]);

  const login = useCallback(
    async (input: LoginInput) => {
      await authApi.login(input);
      // Drop anything cached by a previous session before the new profile loads.
      queryClient.removeQueries({ predicate: isNotSessionQuery });
      // `staleTime: 0`: the cached `null` from the anonymous check must not be reused.
      await queryClient.fetchQuery({
        queryKey: SESSION_QUERY_KEY,
        queryFn: () => authApi.me(),
        staleTime: 0,
      });
    },
    [authApi, queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      queryClient.setQueryData(SESSION_QUERY_KEY, null);
      queryClient.removeQueries({ predicate: isNotSessionQuery });
    }
  }, [authApi, queryClient]);

  /** Polite announcement of the elevation deadline after the dialog closes (Aurora spec item 18). */
  const [elevationNotice, setElevationNotice] = useState("");

  const reauth = useCallback(
    async (input: ReauthInput) => {
      const { elevatedUntil } = await authApi.reauth(input);
      queryClient.setQueryData<SessionSnapshot | null>(SESSION_QUERY_KEY, (current) =>
        current ? { ...current, elevatedUntil } : current,
      );
      // The duration is whatever the server granted (ADR-0007 item 3: 15 min today), never a constant.
      const until = Date.parse(elevatedUntil);
      setElevationNotice(messages.auth.reauth.success(formatClock(until), minutesUntil(until)));
    },
    [authApi, queryClient],
  );

  const elevatedUntil = session.data?.elevatedUntil ?? null;

  const ensureElevated = useCallback(() => {
    if (isElevated(elevatedUntil)) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      // Concurrent callers share the open dialog: chain their resolvers.
      setElevationRequest((current) =>
        current
          ? {
              resolve: (elevated) => {
                current.resolve(elevated);
                resolve(elevated);
              },
            }
          : { resolve },
      );
    });
  }, [elevatedUntil]);

  const settleElevation = useCallback((elevated: boolean) => {
    setElevationRequest((current) => {
      current?.resolve(elevated);
      return null;
    });
  }, []);

  const status: AuthStatus = session.isPending
    ? "loading"
    : session.isError
      ? "unavailable"
      : session.data
        ? "authenticated"
        : "anonymous";

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user: session.data?.user ?? null,
      elevatedUntil,
      error: session.error,
      client,
      login,
      logout,
      reauth,
      refresh,
      ensureElevated,
    }),
    [
      status,
      session.data,
      session.error,
      elevatedUntil,
      client,
      login,
      logout,
      reauth,
      refresh,
      ensureElevated,
    ],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      <ReauthDialog
        open={elevationRequest !== null}
        onSubmit={reauth}
        onSettled={settleElevation}
      />
      <p aria-live="polite" aria-atomic="true" className="sr-only" data-testid="elevation-notice">
        {elevationNotice}
      </p>
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}

export { isElevated };
