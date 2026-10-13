# ADR-0004: OAuth token encryption at rest

- Status: proposed (revised 2026-10-13 after Sentinela's review: `docs/security/oauth-and-tokens.md` §3, `docs/security/threat-model.md` SEC-004, TM-14, G-02)
- Date: 2026-10-13
- Deciders: Atlas (architect); review Sentinela (security); implementation Alicerce (backend), Pêndulo (automation); gate G-02 Alicerce/Estaleiro

## Context

LinkedIn OAuth access tokens (and refresh tokens, when the product grants them) allow posting on
Rodrigo's behalf. The brief requires that tokens never enter Git, logs, the frontend or prompts, and
`security-policy` requires encryption at rest. The deployment is a single Oracle Cloud VM with Docker
Compose; a managed KMS is not assumed for the MVP. Sentinela's review asked for envelope encryption (so
key rotation never re-encrypts tokens), a canonical AAD, fail-closed startup on placeholder secrets, and
separation of database roles.

## Decision

1. **Envelope encryption per credential.** Each `OAuthToken` row gets a random 256-bit DEK. Access and
   refresh tokens are encrypted **separately** with AES-256-GCM using the DEK, a fresh random 96-bit
   nonce per operation and a 128-bit tag. The DEK is wrapped with the active KEK (AES-256-GCM key wrap
   with its own nonce). Persisted columns: `access_token_ciphertext`, `refresh_token_ciphertext`
   (each `bytea` = `schemaVersion(1) || nonce(12) || ciphertext || tag(16)`), `wrapped_dek` (`bytea`),
   `key_version` (`text`). No plaintext column exists.
2. **Canonical AAD** = `"<schemaVersion>|<provider>|<userId>|<credentialId>|<tokenType>"` (`tokenType` ∈
   `access | refresh`; DEK wrap uses `tokenType = dek`). A ciphertext cannot be moved between rows,
   columns or users.
3. **KEK material**: `ENCRYPTION_KEY` (base64 of exactly 32 bytes, CSPRNG) from the runtime environment
   (Docker secret / `.env` on the host), never in Git, images, database, logs, frontend or ordinary
   backups. Key ring: `ENCRYPTION_KEYS="<version>:<base64>,..."` + `ENCRYPTION_ACTIVE_KEY_VERSION`; a
   single `ENCRYPTION_KEY` is shorthand for version `1`.
4. **Startup fail-closed (SEC-004).** Outside `NODE_ENV=development`, `api` and `worker` refuse to start
   when `ENCRYPTION_KEY`/`ENCRYPTION_KEYS` is empty, equals a placeholder (`change-me*`, the `.env.example`
   value), is not valid base64 of 32 bytes, or when `SESSION_SECRET` is empty/placeholder/shorter than
   32 bytes. The check runs in `packages/config` (`validateRuntimeEnv`) before any module loads. In
   `development` the same validation logs a loud warning. `.env.example` keeps obviously invalid values.
5. **Single decryption gateway.** Only `TokenVault.withAccessToken(credentialId, fn)` (and the refresh
   equivalent) in `packages/domain` decrypts; the plaintext is passed to `fn` and dropped. Callers:
   the OAuth callback use case (encrypt only), and worker handlers `publication.publish`,
   `media.upload-linkedin`, `publication.reconcile`, `linkedin.token-refresh`. No service method
   reachable from the HTTP layer returns plaintext.
6. **API surface**: DTOs for `/integrations/linkedin` expose only status, scopes, expiry and member URN.
   A contract test fails if any response schema contains a field matching `/token|secret|dek|ciphertext/i`.
7. **Logging and errors**: Pino `redact` covers `authorization`, `cookie`, `set-cookie`, `code`, `state`,
   `nonce`, `*.accessToken`, `*.refreshToken`, `*.access_token`, `*.refresh_token`, `*.client_secret`,
   `*.apiKey`, `*.wrappedDek`. Outbound HTTP logs method/host/path/status only; errors never embed the
   HTTP client request config (it may contain `Authorization`). Decrypt failures (wrong key, AAD, tag)
   fail closed with a generic error and no plaintext.
8. **Rotation** (`pnpm --filter domain cli keys:rotate`): add new KEK version, set it active, re-wrap
   DEKs in idempotent batches (tokens are **not** re-encrypted), verify 100% of rows with an
   authenticated decrypt, then retire the old version after dependent backups expire or are re-encrypted.
   The job logs counts and internal ids only. Emergency rotation on suspected KEK exposure additionally
   revokes/disconnects all LinkedIn credentials and notifies Rodrigo.
9. **Database roles (TM-14)**: separate PostgreSQL roles for migrations (DDL), runtime (DML on app
   tables, `INSERT`-only on `audit_events`, no DDL) and backup (read-only). The runtime role has no
   access to key material; backups contain ciphertext and wrapped DEKs only. Backup encryption and
   restore drills are Estaleiro's (G-06).
10. **Prompts**: the editorial engine never receives credentials (ADR-0005); the worker injects them only
    into the LinkedIn HTTP adapter inside `withAccessToken`.
11. **Lifecycle**: `OAuthToken.status` tracks `ACTIVE | EXPIRED | REVOKED | REAUTH_REQUIRED`. A daily job
    refreshes when a refresh token exists **and** the app is entitled to it (SEC-002: not guaranteed by
    LinkedIn), otherwise notifies at T-7 and T-1 days before expiry and sets `REAUTH_REQUIRED` at expiry,
    which blocks `publication.publish`. Disconnecting revokes server-side where the API allows it and
    deletes ciphertexts, wrapped DEK and any pending `state`/verifier; the `AuditEvent` keeps metadata only.
12. **Other secrets** (OpenAI key, Telegram token, S3 keys, LinkedIn client secret, session secret) are
    runtime environment variables consumed only by `api`/`worker`, never persisted in the database.

## Alternatives considered

- **Plaintext with DB-level encryption (disk/TDE) only.** Rejected: any DB read (dump, SQL injection,
  misconfigured tool) exposes tokens.
- **Direct KEK encryption without DEKs (first draft of this ADR).** Rejected after review: rotation
  would re-encrypt every token and the blast radius of a KEK compromise is identical; envelope adds one
  column and makes a later move to OCI Vault/KMS a wrap-only change.
- **Cloud KMS (OCI Vault) now.** Preferred long-term; deferred because it adds an external dependency
  and IAM setup to the MVP. `key_version` and the wrap step allow adopting it without a schema change.
- **Hashing.** Not applicable: tokens must be recoverable.
- **Storing tokens only in memory.** Rejected: publishing must survive restarts and run from the worker.

## Consequences

- Mandatory validated env in all non-dev environments; misconfiguration fails fast and visibly.
- `packages/domain` gains `TokenVault`, the key ring, the `keys:rotate` CLI and tests: round-trip,
  AAD mismatch, tag tampering, wrong key, rotation interrupted and resumed, redaction, startup rejection
  of placeholders. These tests are the evidence for gate G-02.
- Loss of the KEK means re-connecting LinkedIn (acceptable; documented in the runbook).
- Three database roles must exist in Compose/migrations (Estaleiro + Alicerce).

## Security / compliance impact

- Meets "tokens cifrados em repouso" and "nunca em logs/frontend/prompts"; addresses SEC-004, TM-14,
  G-02 from the threat model.
- Reduces blast radius of a database leak to ciphertext + wrapped DEKs; rotation does not touch tokens.
- Sentinela to confirm AAD composition, the fail-closed matrix and the rotation procedure before acceptance.
