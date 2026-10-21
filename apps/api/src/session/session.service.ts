import {
  CSRF_TOKEN_HEADER as CONTRACT_CSRF_TOKEN_HEADER,
  SESSION_COOKIE_NAME as CONTRACT_SESSION_COOKIE_NAME,
} from "@linkedin-ops/contracts";

export type {
  AuthenticatedSession,
  AuthOutcome,
  IssuedSession,
  RequestMeta,
  SessionService,
  UserProfiles,
} from "@linkedin-ops/domain";

/** Cookie name fixed by ADR-0007 (`__Host-` prefix: Secure, Path=/, no Domain); value from the contract. */
export const SESSION_COOKIE_NAME: string = CONTRACT_SESSION_COOKIE_NAME;
/** Header carrying the CSRF token: in responses after every session rotation (N2), in requests on 🔐 routes. */
export const CSRF_TOKEN_HEADER: string = CONTRACT_CSRF_TOKEN_HEADER.toLowerCase();
export const CSRF_TOKEN_REQUEST_HEADER: string = CSRF_TOKEN_HEADER;

/**
 * Injection token for the domain `SessionService` port (packages/domain `auth/session.ts`): the
 * PostgreSQL-backed `PrismaSessionService` in the app, a fake in the Supertest suites.
 */
export const SESSION_SERVICE = Symbol("SESSION_SERVICE");
/** Injection token for `UserProfiles` (profile reads for `GET /auth/me`). */
export const USER_PROFILES = Symbol("USER_PROFILES");
