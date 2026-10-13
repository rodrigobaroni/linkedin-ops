# ADR-0007: Authentication, session and authorization model

- Status: proposed (revised 2026-10-13 after Sentinela's review: `docs/security/oauth-and-tokens.md` §2, §5, §6, §8; `docs/security/threat-model.md` TM-02, TM-06, TM-14, TM-22, G-03)
- Date: 2026-10-13
- Deciders: Atlas (architect); review Sentinela (security); implementation Alicerce (backend), Vitral (web); final say on login model: Rodrigo (open question Q2)

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
4. **Second factor (TOTP)** is planned but not in the MVP; the schema reserves `users.totp_secret_ciphertext`
   (encrypted per ADR-0004). Passkeys are a later enhancement.
5. **LinkedIn OAuth is not login.** `POST /integrations/linkedin/connect` is available only to an
   authenticated, elevated OWNER. `state` is CSPRNG ≥ 256 bits, only its hash is persisted together with
   the session id and expiry (10 minutes), single use, one active state per session (a new request
   invalidates the previous one). PKCE `S256` is used when the registered LinkedIn app accepts it for
   the confidential web flow (Sentinela: proven for native clients, to be verified for our app — G-01);
   the client secret is still sent at token exchange. The callback accepts exactly one of `code`/`error`,
   requires `state`, verifies the state hash against a non-expired, unused record bound to the current
   session, exchanges the code immediately with the byte-identical redirect URI, validates the OIDC id
   token (`RS256`, `iss`, `aud`, `exp`, `iat`, `nonce`), stores the credential (ADR-0004) in one
   transaction, deletes state/verifier and rotates the session. Scopes are the minimum for posting
   (`w_member_social` plus `openid profile` for the member URN) — exact product/scopes confirmed in G-01.
6. **Startup fail-closed**: `SESSION_SECRET` must be ≥ 32 bytes, non-placeholder, validated with the same
   `validateRuntimeEnv` as `ENCRYPTION_KEY` (ADR-0004 §4, SEC-004).

### CSRF and browser hardening (TM-02)

7. For every `POST/PUT/PATCH/DELETE`: valid session; `Origin` **exactly** equal to `APP_BASE_URL` (Fetch
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
    inbound webhooks (if enabled later) authenticate the *bot platform* via secret token and are limited to
    link/test/ack commands — never approval, autonomy change or publishing.

## Alternatives considered

- **"Sign in with LinkedIn" (OIDC) as the only login.** Rejected (and Sentinela recommends against):
  couples dashboard access to LinkedIn availability, scope approval and token expiry; a revoked token
  would lock Rodrigo out of his own tool. Rodrigo ratifies (Q2).
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
  code reused, redirect mismatch, cross-session callback.

## Security / compliance impact

- Minimizes LinkedIn scopes and separates publishing credentials from dashboard access.
- Session revocation, elevation and audit trail support incident response and address TM-02/TM-22.
- Sentinela to review Argon2id parameters, the CSRF matrix, PKCE applicability (G-01) and the elevated
  session design before acceptance; findings go to Alicerce/Vitral.
