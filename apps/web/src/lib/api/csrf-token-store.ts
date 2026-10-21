/**
 * Holds the anti-CSRF token **in memory only** (ADR-0007 N2; T-015 acceptance criteria). It is never
 * written to `localStorage`, `sessionStorage`, cookies, the URL, React Query cache or logs. One instance
 * lives inside `AuthProvider`; a full page reload starts empty and `GET /auth/me` refills it.
 */
export class CsrfTokenStore {
  #token: string | null = null;

  get(): string | null {
    return this.#token;
  }

  set(token: string): void {
    this.#token = token;
  }

  clear(): void {
    this.#token = null;
  }

  /** Keeps the token out of `JSON.stringify`, snapshots and error reports. */
  toJSON(): null {
    return null;
  }
}
