# @linkedin-ops/worker

Background worker (pg-boss, ADR-0002): job handlers and adapters over the domain layer. Thin shell: editorial
logic lives in `@linkedin-ops/editorial-engine` (ADR-0005).

- `src/index.ts`: validates the environment (`validateRuntimeEnv(..., { service: "worker" })`, fails closed),
  starts pg-boss in the `pgboss` schema, provisions the queues, registers the handlers and keeps a heartbeat.
- `src/jobs/`: queue provisioning from the contracts catalogue (dead-letter queue first), `createJobRunner`
  (payload validation, `PermanentJobError` → dead letter, logs without payloads).
- `src/llm/openai.ts`: OpenAI Responses API adapter for the engine's `LlmClient` port (Structured Outputs strict,
  `store: false`, timeout, bounded retry on transient errors, no content in logs).
- `src/career/`: handlers for `cv.extract`, `job.fetch` and `cv.tailor` (spec 2026-10-22) over ports that the
  domain binds in Career PR 2/3; the anonymous job-page fetcher (ADR-0008) arrives in PR 3.
- `src/health/`: heartbeat file and the container healthcheck script.

Tests: `pnpm --filter @linkedin-ops/worker test` (unit, simulated LLM, local HTTP server for the OpenAI adapter)
and `pnpm --filter @linkedin-ops/worker test:integration` (pg-boss on PostgreSQL via Testcontainers; without
Docker, point `WORKER_IT_DATABASE_URL` at an empty throwaway database).
