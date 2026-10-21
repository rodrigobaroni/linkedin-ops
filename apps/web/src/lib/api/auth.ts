import { type LoginInput, type Me, type ReauthInput, routesV1 } from "@linkedin-ops/contracts";
import type { CsrfTokenStore } from "./csrf-token-store";
import type { ApiClient } from "./http";

/** Profile as kept in React state and cache: the CSRF token is stripped and lives only in the store. */
export type SessionUser = Omit<Me, "csrfToken" | "elevatedUntil">;

export type SessionSnapshot = {
  user: SessionUser;
  /** ISO instant until which 🔐 actions are allowed without a new `reauth`; `null` when not elevated. */
  elevatedUntil: string | null;
};

export type AuthApi = {
  /** `POST /auth/login`: stores the token; the profile comes from a following `me()`. */
  login: (input: LoginInput) => Promise<void>;
  /** `GET /auth/me`: refreshes the token and returns the token-less profile. */
  me: (signal?: AbortSignal) => Promise<SessionSnapshot>;
  /** `POST /auth/reauth`: rotates + stores the token; returns the new elevation deadline. */
  reauth: (input: ReauthInput) => Promise<{ elevatedUntil: string }>;
  /** `POST /auth/logout`: revokes the session and forgets the token even if the API failed. */
  logout: () => Promise<void>;
};

export function createAuthApi(client: ApiClient, tokenStore: CsrfTokenStore): AuthApi {
  return {
    async login(input) {
      const { csrfToken } = await client.request(routesV1["auth.login"], { body: input });
      tokenStore.set(csrfToken);
    },
    async me(signal) {
      const { csrfToken, elevatedUntil, ...user } = await client.request(routesV1["auth.me"], {
        signal,
      });
      tokenStore.set(csrfToken);
      return { user, elevatedUntil };
    },
    async reauth(input) {
      const { csrfToken, elevatedUntil } = await client.request(routesV1["auth.reauth"], {
        body: input,
      });
      tokenStore.set(csrfToken);
      return { elevatedUntil };
    },
    async logout() {
      try {
        await client.request(routesV1["auth.logout"]);
      } finally {
        tokenStore.clear();
      }
    },
  };
}
