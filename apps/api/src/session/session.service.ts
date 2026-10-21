import {
  CSRF_TOKEN_HEADER as CONTRACT_CSRF_TOKEN_HEADER,
  SESSION_COOKIE_NAME as CONTRACT_SESSION_COOKIE_NAME,
  type LoginInput,
  type Me,
  type UserRole,
} from "@linkedin-ops/contracts";

/** Cookie name fixed by ADR-0007 (`__Host-` prefix: Secure, Path=/, no Domain); value from the contract. */
export const SESSION_COOKIE_NAME: string = CONTRACT_SESSION_COOKIE_NAME;
/** Header carrying the CSRF token: in responses after every session rotation (N2), in requests on 🔐 routes. */
export const CSRF_TOKEN_HEADER: string = CONTRACT_CSRF_TOKEN_HEADER.toLowerCase();
export const CSRF_TOKEN_REQUEST_HEADER: string = CSRF_TOKEN_HEADER;

/** Injection token for `SessionService`. */
export const SESSION_SERVICE = Symbol("SESSION_SERVICE");

export interface AuthenticatedSession {
  /** Public session id (never the cookie value). */
  id: string;
  userId: string;
  role: UserRole;
  /** Token bound to this session; compared in constant time on elevated routes. */
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
  ip: string | undefined;
  userAgent: string | undefined;
}

/**
 * Boundary between the HTTP layer and session storage. T-008 ships the interface plus an in-memory
 * implementation that never authenticates; T-015 provides the PostgreSQL-backed service (Argon2id
 * verification, rotation, elevation, absolute and sliding expiry) behind the same contract.
 */
export interface SessionService {
  /** Resolves the opaque cookie value to a live session, or `null` (unknown, expired, revoked). */
  resolve(cookieValue: string | undefined): Promise<AuthenticatedSession | null>;
  /** Verifies credentials and issues a new session, or `null` on any failure (generic error upstream). */
  login(input: LoginInput, meta: RequestMeta): Promise<IssuedSession | null>;
  /** Re-authenticates with the password, rotates the session and elevates it for 15 minutes; `null` if wrong. */
  reauth(
    session: AuthenticatedSession,
    password: string,
    meta: RequestMeta,
  ): Promise<IssuedSession | null>;
  /** Profile for `GET /auth/me`, including the current `csrfToken` and elevation state. */
  me(session: AuthenticatedSession): Promise<Me>;
}
