# ADR-0003: Idempotent publishing to LinkedIn

- Status: proposed
- Date: 2026-10-13
- Deciders: Atlas (architect); implementation Pêndulo (automation), Alicerce (backend); review Sentinela (security)

## Context

Publishing is the only irreversible, externally visible action in the system. A retry after a timeout,
a worker crash, a double-delivered job or a double click must never produce two LinkedIn posts for the
same draft. The LinkedIn Posts API does not offer a client-supplied idempotency key (to be re-verified by
Pêndulo against current docs; the design below does not rely on one), so idempotency must be guaranteed
on our side. The brief requires: "Publicações devem ser idempotentes. Um retry não pode gerar post duplicado."

## Decision

**Principle: at-most-once toward LinkedIn, at-least-once for everything around it, with explicit human
reconciliation for the ambiguous window.**

1. **Publication intent is a persisted record.** `POST /drafts/{id}/publish` or a schedule dispatch
   creates a `Publication{status: PENDING}` with a deterministic
   `idempotency_key = pub:<draftId>:<draftVersionId>:<scheduleId | manual:<Idempotency-Key header>>`
   (unique). Creating it and enqueuing `publication.publish{publicationId}` happen in one transaction.
2. **Database guards** (see `data-model.md` I8/I9):
   - partial unique index: one `Publication` per `draft_id` with `status IN ('IN_PROGRESS','SUCCEEDED')`;
   - the worker **claims** the record with `UPDATE publications SET status='IN_PROGRESS', attempt=attempt+1,
started_at=now() WHERE id=$1 AND status='PENDING'`; if `rowCount = 0` the handler exits (already
     claimed, succeeded or cancelled). Only after a successful claim is any LinkedIn call made.
3. **Preconditions re-checked at claim time**, inside the domain: draft is `SCHEDULED`/`PUBLISHING`,
   `approved_version_id = publication.draft_version_id`, `OAuthToken.status = ACTIVE`, autonomy policy
   still allows it (e.g. cancel window elapsed in `AUTOPILOT_CONTROLLED`). Any failure → `FAILED`
   with a structured reason, no LinkedIn call.
4. **Request fingerprint**: the exact payload (commentary, media URNs, visibility) is hashed and stored
   as `request_fingerprint` before the call, so reconciliation can match a post.
5. **Single external call, no automatic retry.** The queue has `retryLimit = 0`. The handler
   distinguishes:
   - **definitive success** (2xx with `x-restli-id`/post URN) → `SUCCEEDED`, `external_post_id`,
     `external_url`, draft → `PUBLISHED`, notification;
   - **definitive failure before the request was accepted** (4xx such as 401/403/422, connection refused
     before sending) → `FAILED`, draft → `FAILED`, notification; user may `retry-publication`, which
     creates a **new** `Publication` with the same version (new key suffix `retry:<n>`) only if the previous
     one is `FAILED` and not ambiguous;
   - **ambiguous outcome** (timeout after sending, 5xx, process crash between call and commit) →
     `AMBIGUOUS`, draft → `FAILED` with `needs_reconciliation = true`, alert. **No automatic retry.**
6. **Reconciliation** (`publication.reconcile`, triggered by the user or by the alert): query the
   LinkedIn API for the author's recent posts, match by `request_fingerprint` (commentary hash) and
   time window; if found → `SUCCEEDED` (store URN); if not found after a conservative window →
   `FAILED` and the user may retry. Stale `IN_PROGRESS` records (> 10 min) are treated as ambiguous by
   `schedule.reconcile`.
7. **Media** is uploaded to LinkedIn (`media.upload-linkedin`) _before_ the publish job, storing
   `linkedin_asset_urn` on the `MediaAsset`; the publish payload references URNs only, so a media retry
   never creates a post.
8. **Audit**: every transition writes an `AuditEvent` with the fingerprint and external ids, never the token.

## Alternatives considered

- **Rely on pg-boss retries with a singleton key only.** Rejected: protects against duplicate jobs, not
  against a retry after an ambiguous call.
- **Automatic retry with "check LinkedIn first".** Rejected for the MVP: the lookup can lag and a false
  negative would duplicate a post; a human decision is cheaper than a duplicate on a personal profile.
- **Distributed lock (advisory lock) around the call.** Not needed: the conditional `UPDATE` claim is the
  lock, and it persists across crashes.
- **Client idempotency key on LinkedIn.** Not available (to confirm); if a future API version offers it,
  add it as an extra layer without removing the above.

## Consequences

- A publication can end in `AMBIGUOUS` and require a click from Rodrigo; the UI must surface it clearly.
- Tests required: double job delivery, crash between call and commit (fault injection), token revoked
  at claim time, version edited after schedule, reconcile match/no-match.
- Throughput is irrelevant (a few posts per week); correctness wins.

## Security / compliance impact

- Prevents inauthentic-looking duplicate activity on the profile, in line with LinkedIn policies.
- Tokens are decrypted only inside the publish/refresh handlers (ADR-0004) and never logged.
- Reconciliation reads only the member's own posts with the granted scopes; no scraping.
