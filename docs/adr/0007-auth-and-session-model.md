# ADR-0007: Authentication, session and authorization model

- Status: **accepted** (2026-10-16). Security sign-off with conditions by Sentinela on 2026-10-13
  (`docs/security/oauth-and-tokens.md` §2, §5, §6, §8; `docs/security/threat-model.md` TM-02, TM-06, TM-14,
  TM-22, G-03); the conditions are the normative invariants N1–N4 below. The login model (local credentials,
  question Q2) was **decided by Rodrigo on 2026-10-21: local login** (e-mail + Argon2id password, server-side
  session, optional TOTP); "Sign in with LinkedIn" is not used to authenticate. Q2 is closed.
- Date: 2026-10-13 (accepted 2026-10-16)
- Deciders: Atlas (architect); review Sentinela (security); implementation Alicerce (backend), Vitral (web); login model decided by Rodrigo on 2026-10-21 (Q2 closed: local login)

## Context

The product is single-user (Rodrigo) today, exposed on the public internet behind Caddy, and holds
credentials that can post on a personal LinkedIn profile. The data model and authorization must not
block a future multi-user setup. Authentication must not depend on LinkedIn availability or on scopes
LinkedIn may not grant, and the LinkedIn OAuth connection (for publishing) must be a separate concern
from logging into the dashboard. Sentinela's threat model rates CSRF/IDOR on drafts, autonomy and the
LinkedIn connection as high (TM-02) and silent autonomy elevation as high (TM-22).

## Decision

### Authentication

1. **Local credentials**: email + password hashed with Argon2id (parameters calibrated on the host,
   OWASP minimums), constant-time comparison, generic error message, minimum password length 15 for
   the single-user phase, rate limiting per IP and per account with progressive delay on `/auth/login`.
   Login attempts are logged with truncated/hashed IP, minimized user agent and correlation id, never
   the password. The first user is created by a CLI command, not by a public sign-up endpoint.
2. **Server-side sessions** in PostgreSQL (`sessions` table): 256-bit CSPRNG id, stored as SHA-256 hash;
   cookie `__Host-session=<opaque>; Path=/; HttpOnly; Secure; SameSite=Lax` with no `Domain`; absolute
   lifetime 30 days, idle timeout 7 days (sliding). The session id **rotates** on login, re-authentication,
   password change, LinkedIn connection and autonomy mode change. Logout deletes the row and expires the
   cookie; `POST /auth/logout-all` revokes every session; `GET/DELETE /auth/sessions` manage devices.
3. **Elevated session for high-risk actions (TM-22).** `POST /auth/reauth` (password) marks the session
   elevated for 15 minutes. Endpoints marked 🔐 in `contracts.md` — change autonomy mode, connect/disconnect
   LinkedIn, publish now, change password — require an elevated session **and** a CSRF token bound to the
   session (`X-CSRF-Token`, derived with HMAC from `SESSION_SECRET` and the session id). Otherwise
   `401 AUTH_REAUTH_REQUIRED`.
   **N2 — how the browser obtains and renews the token.** The session cookie is `HttpOnly`, so the client
   cannot derive the token; the API hands it over: `POST /auth/login` and `POST /auth/reauth` answer
   `200 { csrfToken, elevatedUntil | null }` (not `204`), `GET /auth/me` always includes the current
   `csrfToken`, and every response that **rotated** the session (login, reauth, password change, LinkedIn
   connection, autonomy mode change) carries the new token in the `X-CSRF-Token` response header; after the
   OAuth callback redirect the web calls `GET /auth/me`. The web keeps the token in memory only (never
   `localStorage`), and on `403 CSRF_REJECTED` refetches `/auth/me` once before surfacing the error.
4. **Second factor (TOTP)** is planned but not in the MVP; the schema reserves `users.totp_secret_ciphertext`
   (encrypted per ADR-0004). Passkeys are a later enhancement.
5. **LinkedIn OAuth is not login.** `POST /integrations/linkedin/connect` is available only to an
   authenticated, elevated OWNER. `state` is CSPRNG ≥ 256 bits, only its hash is persisted together with
   the session id and expiry (10 minutes), single use, one active state per session (a new request
   invalidates the previous one). PKCE `S256` is used when the registered LinkedIn app accepts it for
   the confidential web flow (Sentinela: proven for native clients, to be verified for our app — G-01);
   the client secret is still sent at token exchange. The callback accepts exactly one of `code`/`error`,
   requires `state`, exchanges the code immediately with the byte-identical redirect URI, validates the OIDC id
   token (`RS256`, `iss`, `aud`, `exp`, `iat`, `nonce`), stores the credential (ADR-0004) in one
   transaction, deletes state/verifier and rotates the session. Scopes are the minimum for posting
   (`w_member_social` plus `openid profile` for the member URN) — exact product/scopes confirmed in G-01.
   **N1 — the `state` is claimed atomically before any external call** (`oauth-and-tokens.md` §2.3 step 3):
   a single conditional `UPDATE oauth_states SET used_at = now() WHERE state_hash = $1 AND used_at IS NULL
AND expires_at > now() AND session_id = $2 RETURNING ...`; zero rows → the callback is rejected without
   calling LinkedIn. The claim happens on **both** the `code` and the `error` paths, so an `error` callback
   also consumes the state. Two concurrent callbacks with the same `state` must yield exactly one exchange;
   this is a required integration test (G-03).
   **N3 — G-01 stays open.** PKCE `S256` is enabled only after an end-to-end proof on the real confidential
   app; the mode is an explicit setting (`LINKEDIN_PKCE = required | disabled`) and a mismatch fails loudly —
   never a silent fallback from `required` to plain Authorization Code. The implementation validates the OIDC
   claims **actually returned** by LinkedIn (recorded in G-01, not assumed) and the formation of the Person
   URN from `sub` is confirmed against that evidence before `linkedin_member_urn` is persisted.
6. **Startup fail-closed**: `SESSION_SECRET` must be ≥ 32 bytes, non-placeholder, validated with the same
   `validateRuntimeEnv` as `ENCRYPTION_KEY` (ADR-0004 §4, SEC-004).

### CSRF and browser hardening (TM-02)

7. **N4.** For every `POST/PUT/PATCH/DELETE`: valid session — with exactly one exception, `POST /auth/login`,
   which by definition has no session yet but still requires all the other controls below plus the rate
   limit of item 10 (`/health`, `/ready` are `GET` without side effects; the OAuth callback is covered at the
   end of this item); `Origin` **exactly** equal to `APP_BASE_URL` (Fetch
   Metadata `Sec-Fetch-Site` as an additional, not sole, check); `Content-Type: application/json`;
   header `X-Requested-With: linkedin-ops`; reject form bodies, `Origin: null` and method override
   headers. 🔐 endpoints add `X-CSRF-Token` + elevated session (item 3). The OAuth callback is the only
   `GET` with side effects and is protected by the single-use `state`; it never changes editorial data.
8. Caddy/web headers: HSTS, restrictive CSP for `web`, `frame-ancestors 'none'`,
   `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, minimal `Permissions-Policy`.
9. No CORS in production (same origin via Caddy); development uses Next.js rewrites to stay
   same-origin, with explicit origin/redirect allowlists and never reflecting `Origin` with credentials.
10. Rate limits (initial values from Sentinela's table): login 5/10 min per account and IP; OAuth start
    5/10 min per session; callback 20/10 min per IP; publish now 3/10 min per user; autonomy change
    3/10 min per user. Returned as `429 RATE_LIMITED` with `Retry-After`.

### Authorization

11. **Roles**: `UserRole = OWNER | EDITOR | VIEWER` exists from day one; only `OWNER` is used in the MVP.
    Role → permission map lives in `packages/domain/authorization` (e.g. `publication:create` and
    `settings:autonomy` require OWNER; `draft:edit` OWNER|EDITOR; `*:read` all).
12. **Resource ownership (TM-14)**: every aggregate root has `user_id`; every repository query is scoped
    through `AuthorizationService.scope(actor)` and every mutation goes through
    `AuthorizationService.assert(actor, permission, resource)`. Cross-user access returns `404`, not `403`,
    to avoid leaking existence. Prisma parameterized queries only; dynamic SQL is forbidden by lint. A
    negative multi-tenant test walks all repositories with a second user.
13. **Job payloads carry ids, not authority (TM-06).** Worker handlers re-read state and re-validate the
    approved version and the current autonomy policy inside the transaction before any side effect;
    a forged payload cannot bypass approval.
14. **Multi-user path**: adding users means adding rows; adding a shared profile (several editors for one
    LinkedIn account) means introducing a `Workspace` entity that owns the resources and a
    `WorkspaceMember(user, role)` table. Because scoping is centralized, that migration touches
    `AuthorizationService` and a column rename (`user_id → workspace_id` on roots), not the controllers.
    Decision deferred (question Q5 in `system-overview.md`).
15. **System actor and autonomy guard (TM-22)**: autonomous actions run as
    `actor = { type: SYSTEM, policy: AutonomySettings }`; authorization for SYSTEM is the autonomy policy,
    not the role map, and every such action records a `reason` (data-model I5). Changing the mode requires
    an elevated session, writes an `AuditEvent` with before/after, and `AUTOPILOT_FULL` is selectable only
    when the operational flag `AUTOPILOT_FULL_ENABLED` is on (default off until gates G-01..G-06 and two
    incident-free weeks of assisted operation, per Sentinela's open question 4). The worker re-validates
    the mode at publish time.

### Telegram

16. Telegram identity is never an authentication factor. Notification `chatId` is configuration;
    inbound webhooks (if enabled later) authenticate the _bot platform_ via secret token and are limited to
    link/test/ack commands — never approval, autonomy change or publishing.

## Alternatives considered

- **"Sign in with LinkedIn" (OIDC) as the only login.** Rejected (and Sentinela recommends against):
  couples dashboard access to LinkedIn availability, scope approval and token expiry; a revoked token
  would lock Rodrigo out of his own tool. Q2 **closed on 2026-10-21**: Rodrigo chose local login. An optional
  "Entrar com LinkedIn" shortcut may be added later on top of the T-038 OAuth connection, never as the only
  login; that would be a separate, small ADR amendment.
- **Stateless JWT sessions.** Rejected: no server-side revocation, larger cookie, more ways to misuse;
  no scale need.
- **Auth.js / NextAuth in `web`.** Rejected: it would move authentication (and secrets) into the
  frontend process; the API is the trust boundary.
- **Basic auth at Caddy only.** Rejected: no audit trail, no per-action authorization, no roles.
- **Synchronizer CSRF token on every mutation.** Rejected as the baseline (Origin + JSON + custom header
  already block browser-driven CSRF); kept only for 🔐 endpoints as defense in depth.

## Consequences

- `apps/web` holds no auth secrets; it only forwards the cookie and the CSRF token header. Server
  Components may read via the API with the cookie; mutations go through the client. The UI must handle
  `AUTH_REAUTH_REQUIRED` by prompting for the password inline.
- `packages/domain` gains `authorization/` and `sessions/`; `apps/api` gains guards (`SessionGuard`,
  `ElevatedSessionGuard`, `CsrfGuard`, `RoleGuard`) and the auth controller.
- Operational runbook needs: user creation CLI, password reset CLI (no email flow in MVP), session purge job,
  `AUTOPILOT_FULL_ENABLED` flag procedure.
- Tests (evidence for G-03 and TM-02): login throttling, cookie flags, CSRF rejection matrix
  (cross-site, form-urlencoded, `Origin: null`, missing custom header, method override, preflight),
  elevated-session expiry, scoping test across repositories, OAuth state wrong/missing/expired/reused,
  code reused, redirect mismatch, cross-session callback, **concurrent callbacks with the same state (N1)**,
  `error` callback consuming the state (N1), CSRF token renewal after each session rotation (N2),
  PKCE mode mismatch failing loudly (N3).
- `contracts.md` and `packages/contracts`: `auth.login` and `auth.reauth` return `200 { csrfToken, elevatedUntil }`
  instead of `204`; `GET /auth/me` gains `csrfToken` (follow-up for Alicerce in T-008).

## Security / compliance impact

- Minimizes LinkedIn scopes and separates publishing credentials from dashboard access.
- Session revocation, elevation and audit trail support incident response and address TM-02/TM-22.
- Sentinela signed off on 2026-10-13 with conditions, now normative as N1–N4; Argon2id parameters are
  checked at implementation review. G-01 (real app scopes, PKCE, OIDC claims) remains the only open gate.
