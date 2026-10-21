import type { UserRole } from "@linkedin-ops/contracts";

/** ADR-0007 §1: absolute lifetime 30 days, idle timeout 7 days (sliding). */
export const SESSION_ABSOLUTE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_IDLE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** ADR-0007 item 3: `POST /auth/reauth` elevates the session for 15 minutes. */
export const ELEVATION_WINDOW_MS = 15 * 60 * 1000;
/** The sliding expiry is written at most once per minute per session (no write on every request). */
export const SESSION_TOUCH_INTERVAL_MS = 60 * 1000;

export interface AuthenticatedSession {
  /** Public session id (never the cookie value). Changes on every rotation. */
  id: string;
  userId: string;
  role: UserRole;
  /** HMAC of the session id with `SESSION_SECRET` (ADR-0007 N2); compared in constant time on 🔐 routes. */
  csrfToken: string;
  elevatedUntil: Date | null;
  expiresAt: Date;
}

/** A session that was just created or rotated: the cookie value travels only here, never in logs. */
export interface IssuedSession {
  session: AuthenticatedSession;
  cookieValue: string;
  cookieMaxAgeSeconds: number;
}

export interface RequestMeta {
  /** Client IP as resolved by the HTTP layer (`TRUSTED_PROXY_CIDRS`); minimized before it is stored. */
  ip: string | undefined;
  userAgent: string | undefined;
  /** Request id, recorded on the audit events the operation writes. */
  correlationId: string;
}

/**
 * Outcome of an operation that checks a password. `rate_limited` carries whole seconds (`Retry-After`);
 * `session_gone` means the password was right but the session was rotated or revoked meanwhile (reauth).
 */
export type AuthOutcome =
  | { kind: "ok"; issued: IssuedSession }
  | { kind: "invalid" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "session_gone" };

/**
 * Port between the HTTP layer and session storage (ADR-0007). `apps/api` only adapts it (guard, cookie
 * writer, controller); every rule — Argon2id, throttling, rotation, elevation, expiry — lives behind it.
 */
export interface SessionService {
  /** Resolves the opaque cookie value to a live session, or `null` (unknown, expired, revoked). */
  resolve(cookieValue: string | undefined): Promise<AuthenticatedSession | null>;
  /** Verifies the credentials and issues a new, non-elevated session. */
  login(email: string, password: string, meta: RequestMeta): Promise<AuthOutcome>;
  /** Checks the password again, rotates the session and elevates it for 15 minutes. */
  reauth(session: AuthenticatedSession, password: string, meta: RequestMeta): Promise<AuthOutcome>;
  /**
   * Rotates the session (new id, cookie and CSRF token) keeping its elevation. The old cookie stops working
   * in the same transaction; `null` if the session was already rotated or revoked (concurrent request).
   */
  rotate(session: AuthenticatedSession, meta: RequestMeta): Promise<IssuedSession | null>;
  /** Revokes the current session. Idempotent. */
  logout(session: AuthenticatedSession, meta: RequestMeta): Promise<void>;
  /** Revokes every session of the user. Idempotent. */
  logoutAll(session: AuthenticatedSession, meta: RequestMeta): Promise<void>;
}
