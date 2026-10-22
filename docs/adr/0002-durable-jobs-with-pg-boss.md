# ADR-0002: Durable background jobs with pg-boss

- Status: proposed
- Date: 2026-10-13
- Deciders: Atlas (architect); implementation owners Pêndulo (automation) and Alicerce (backend)

## Context

The system runs scheduled curation (Mon/Wed/Fri 09:00 `America/Sao_Paulo`), feed fetching, LLM
generation, media rendering, LinkedIn publishing at a scheduled time, token refresh and Telegram
notifications. These must survive process restarts, retry safely, never duplicate a LinkedIn post, and
be observable. The approved stack names pg-boss; this ADR fixes how it is used.

## Decision

1. **pg-boss on the same PostgreSQL** instance and database as the application data, in its own schema
   (`pgboss`). No Redis, no external broker.
2. **Queue catalogue lives in `packages/contracts/src/jobs/queues.ts`**: name, Zod payload, retry limit,
   backoff, expiry, singleton key derivation, dead-letter queue. API and worker import the same definitions.
3. **Enqueue is atomic with the state change.** Application services run the state transition and the
   enqueue inside one Prisma interactive transaction, passing the transaction client to pg-boss through its
   pluggable `db` executor (`{ executeSql }` bound to `tx.$executeRawUnsafe`). The job becomes visible only
   if the transaction commits. If this integration proves unreliable (criterion: any lost or phantom job in
   integration tests, or pg-boss removing the executor hook), fall back to a transactional outbox table
   (`outbox_jobs`) drained by a worker relay — the service code does not change, only the `JobQueue` port.
   Canonical form (cv.extract, PR #92): the domain repository hands its `tx` to the producer as a
   `SqlExecutor` (`packages/domain`, bound to `tx.$queryRawUnsafe`, which returns the inserted id) and the
   producer calls `boss.send(name, payload, { db })`; the producer is started outside any transaction.
4. **Worker process**: `apps/worker` boots a NestJS application context (no HTTP server), registers one
   handler per queue, validates payloads with Zod before executing, and reports results through
   `packages/domain` services (never by calling the API). Concurrency per queue is configured
   (e.g. `draft.generate` 2, `publication.publish` 1).
5. **Cron**: the worker registers `curation.run` with pg-boss `schedule()` using
   `cron = "0 9 * * 1,3,5"` and `tz = "America/Sao_Paulo"`. The handler first inserts a `CurationRun`
   keyed by `(user_id, scheduled_for)` (unique) so a double fire is a no-op. A `schedule.reconcile` job
   runs every 5 minutes and re-enqueues overdue schedules/publications that have no active job; a
   daily `linkedin.token-refresh` and `curation.expire` complete the cron set.
6. **Scheduled publishing** uses `send(queue, payload, { startAfter: scheduledAtUtc, singletonKey: publicationId })`.
7. **Retries** are per-queue and only for transient errors (network, 5xx, 429 with `Retry-After`).
   Handlers classify errors (`TRANSIENT` vs `PERMANENT`) and throw a non-retryable error for permanent
   failures, which moves the job to `<queue>.dead` and records a `FAILED` state + `Notification`.
   `publication.publish` has **retryLimit 0** at the queue level; retries are explicit domain decisions
   (ADR-0003).
8. **Idempotent handlers**: every handler is safe to run twice. It loads current state, checks it is
   still the expected one (e.g. draft still `GENERATING`), and exits quietly otherwise.
9. **Observability**: each job carries `correlationId`; handlers log `queue`, `jobId`, `attempt`,
   duration, error class (never payload bodies with external content or tokens). Dead-letter growth and
   missed cron (no `CurationRun` by 09:30) raise alerts.

## Amendment (2026-10-22, Career PR 1)

- **Worker bootstrap.** Item 4 is relaxed for now: `apps/worker` boots as a plain composition root (pg-boss +
  Pino, `apps/worker/src/index.ts`), not a NestJS application context. The worker does not call domain
  services yet; the Career handlers depend on ports (`apps/worker/src/career/ports.ts`) that the domain binds in
  Career PR 2/3. A NestJS context (or another container) is reconsidered when the worker needs the domain's
  application services. Decision by the Maestro on 2026-10-22; Atlas confirms in review.
- **Dead letter without retries.** Handlers run with pg-boss `perJobResults`; a permanent failure (invalid
  payload, `PermanentJobError`) returns `deadletter`, which skips the remaining retries (item 7).
- **Per-domain serialization.** `job.fetch` runs with `groupConcurrency: 1`; producers send
  `group: { id: <registrable domain> }` (ADR-0008 §4).
- **Liveness.** No HTTP: a heartbeat file is rewritten while pg-boss runs and the database answers; the
  container healthcheck fails when it is older than 60 s.



- **BullMQ / Redis.** Rejected: adds a stateful service to operate and back up; pg-boss gives
  transactional enqueue with the data we already persist.
- **Temporal / durable workflow engine.** Rejected for scale and operational cost; our workflows are
  short chains of jobs with state in Postgres.
- **In-process timers / `setInterval` in the API.** Rejected: not durable, duplicates on multiple
  replicas, blocks HTTP latency.
- **Outbox pattern from day one.** Deferred: kept as the documented fallback; pg-boss's executor hook
  avoids the relay component when it works.

## Consequences

- Single operational dependency (Postgres) for data and queues; backups cover both.
- Job payloads are contracts; changing them requires `schemaVersion` bumps and N-1 compatibility
  during deploys.
- Integration tests (Testcontainers) must cover: double cron fire, worker crash mid-job, retry
  classification, dead-letter routing, transaction rollback not leaving jobs.
- Worker and API are separate containers in Compose; both need `DATABASE_URL`; only the worker needs
  OpenAI/LinkedIn/Telegram/S3 credentials (the API needs LinkedIn client credentials for the OAuth callback).

## Security / compliance impact

- Payloads contain ids, not content, so untrusted source text never travels through the queue.
- pg-boss tables are in the same database; the app DB role is the only accessor; no network exposure.
- Rate limiting toward LinkedIn and OpenAI is enforced in handlers (concurrency + backoff), supporting
  the "no aggressive automation" policy.
