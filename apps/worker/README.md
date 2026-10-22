# @linkedin-ops/worker

Background worker (pg-boss, ADR-0002): job handlers and adapters over the domain layer. Thin shell: editorial
logic lives in `@linkedin-ops/editorial-engine` (ADR-0005).

- `src/index.ts`: validates the environment (`validateWorkerEnv`, fails closed; it never reads session, cipher or LinkedIn secrets),
  starts pg-boss in the `pgboss` schema, provisions the queues, registers the handlers and keeps a heartbeat.
- `src/jobs/`: queue provisioning from the contracts catalogue (dead-letter queue first), `createJobRunner`
  (payload validation, `PermanentJobError` → dead letter, logs without payloads).
- `src/llm/openai.ts`: OpenAI Responses API adapter for the engine's `LlmClient` port (Structured Outputs strict,
  `store: false`, timeout, bounded retry on transient errors, no content in logs).
- **Ceiling of OpenAI requests** (worst case, every attempt failing transiently): each model call makes at most
  2 HTTP requests (`OPENAI_DEFAULT_MAX_RETRIES = 1`, transient errors only: network, 429, 5xx; an exhausted quota,
  auth, refusal or bad request is never retried), and the queue re-runs the job up to `retryLimit` times.
  Per job: `cv.extract` 1 call × 2 × 3 runs = **6**; `job.fetch` up to 3 `job-extract` calls (2 regenerations of
  invalid output inside the handler) × 2 × 2 runs = **12**; `cv.tailor` 1 `cv-tailor` + up to 3 `cv-humanize`
  calls × 2 × 3 runs = **24**. Invalid model output alone costs 1 request per call (no HTTP retry).
- `src/career/`: handlers for `cv.extract`, `job.fetch` and `cv.tailor` (spec 2026-10-22) over ports that the
  domain binds in Career PR 2/3; the anonymous job-page fetcher (ADR-0008) arrives in PR 3.
- `src/health/`: heartbeat file and the container healthcheck script.

Tests: `pnpm --filter @linkedin-ops/worker test` (unit, simulated LLM, local HTTP server for the OpenAI adapter)
and `pnpm --filter @linkedin-ops/worker test:integration` (pg-boss on PostgreSQL via Testcontainers; without
Docker, point `WORKER_IT_DATABASE_URL` at an empty throwaway database).
