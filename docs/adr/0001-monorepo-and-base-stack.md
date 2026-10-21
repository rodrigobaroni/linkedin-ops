# ADR-0001: Monorepo and base stack

- Status: accepted (stack and baseline structure, decided by Rodrigo in `docs/product/maestro-prompt.md` §3 and §6); structure amendment (`packages/domain`) **accepted** by Rodrigo on 2026-10-13; amended 2026-10-16 (dev/CI object store)
- Date: 2026-10-13
- Deciders: Rodrigo (product owner), Atlas (architect)

## Context

LinkedIn Ops is a self-hosted web platform (dashboard + API + background worker) that curates editorial
opportunities, generates drafts with an LLM, and publishes to LinkedIn through the official API. The
product brief fixes the technology stack and a baseline repository layout and states that any change
requires an ADR. This ADR records that decision so the rest of the ADR series can reference it, and it
makes explicit the responsibilities of each workspace package.

## Decision

### Stack (accepted)

| Concern         | Choice                                                                                                                             |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo        | pnpm workspaces + Turborepo                                                                                                        |
| Web             | Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui; TanStack Query for server state; React Hook Form + Zod for forms |
| API             | NestJS, REST, OpenAPI                                                                                                              |
| Worker          | Node.js/TypeScript + pg-boss (see ADR-0002)                                                                                        |
| Database        | PostgreSQL + Prisma                                                                                                                |
| Files           | S3-compatible object storage (RustFS in dev/CI, OCI Object Storage in prod)                                                        |
| AI              | OpenAI Responses API with Structured Outputs                                                                                       |
| Tests           | Vitest, Supertest, Playwright, Testcontainers                                                                                      |
| Infra           | Docker Compose, Caddy, Oracle Cloud                                                                                                |
| CI/CD           | GitHub Actions                                                                                                                     |
| Observability   | Pino, health checks, OpenTelemetry, alerts                                                                                         |
| Publishing      | Official LinkedIn API (OAuth 2.0) only                                                                                             |
| Notifications   | Telegram Bot API                                                                                                                   |
| Local rendering | Sharp, Satori, Resvg                                                                                                               |

Languages: code, identifiers, branches, commits, schemas and APIs in English; initial UI and product
docs in Brazilian Portuguese; ADRs and strictly technical docs may be in English. The editorial engine
targets pt-BR first, English optional.

### Baseline structure (accepted)

```text
apps/        web · api · worker
packages/    contracts · editorial-engine · ui · config
infra/       docker · caddy
docs/        product · architecture · adr · security · editorial · backlog
tests/       e2e · fixtures
```

Package responsibilities (normative; see `docs/architecture/system-overview.md`):

- `packages/contracts`: Zod schemas, inferred types, route registry, job payloads, OpenAPI source. No logic.
- `packages/editorial-engine`: pure editorial logic (prompts, parsing, scoring, evals). No I/O (ADR-0005).
- `packages/ui`: shared React components/design tokens. No data fetching, no business rules.
- `packages/config`: shared ESLint/TS/Tailwind/Vitest configs.
- `apps/web`: presentation only; never holds secrets or a database connection.
- `apps/api`: HTTP adapters (auth, validation, controllers) over the domain layer.
- `apps/worker`: pg-boss handlers and external-service adapters over the domain layer.

Dependency direction (enforced by lint rule / `dependency-cruiser`):

```text
apps/* → packages/domain → packages/editorial-engine → packages/contracts
apps/* → packages/contracts
apps/web → packages/ui
nothing depends on apps/*
```

### Structure amendment (accepted by Rodrigo on 2026-10-13 — resolves Q1 in system-overview.md)

Add `packages/domain` (`@linkedin-ops/domain`): entities, content state machine, autonomy policy,
application services, Prisma schema/client and repositories, token encryption. Both `apps/api` and
`apps/worker` depend on it, so business rules exist exactly once and neither app imports the other.

Rationale: the brief forbids business rules in controllers and the worker must perform the same state
transitions as the API (`GENERATING → DRAFT`, `PUBLISHING → PUBLISHED`). Without a shared package the
options are cross-app imports (`apps/worker` importing `apps/api`) or an internal HTTP API, both worse
(see Alternatives).

### Amendment (2026-10-16): dev/CI object store

MinIO is no longer distributable (Docker Hub images removed, upstream repository
archived in 2026-04), so dev/CI/Testcontainers use RustFS (docker.io/rustfs/rustfs:1.0.1, Apache-2.0,
pinned by tag and digest) as the S3-compatible store; production remains OCI Object Storage. Application
code depends only on the standard S3 API (SigV4, path-style, presigned URLs) through S3_* variables;
vendor-specific admin or console APIs are forbidden so the dev store can be replaced without code changes.

## Alternatives considered

- **Single Next.js app with route handlers and server actions doing everything.** Rejected: long-running
  LLM/publishing work does not belong in request handlers; no durable queue; secrets would live next to
  the frontend process.
- **Separate repositories per app.** Rejected: contracts drift, harder for a small team and agents to
  make atomic changes across web/api/worker.
- **Domain code inside `apps/api`, worker imports it.** Rejected: an app depending on another app
  breaks build boundaries and Turborepo caching, and tempts HTTP concerns into the domain.
- **Worker calls the API over an internal HTTP endpoint.** Rejected for the MVP: adds an internal auth
  surface, makes the worker depend on API availability, and duplicates DTO mapping. Could be revisited if
  the worker is ever deployed outside the same trust boundary.
- **Nx instead of Turborepo, or no task runner.** Rejected: Turborepo is sufficient and already approved.

## Consequences

- Every architectural change goes through an ADR; the base stack is frozen otherwise.
- `packages/domain` becomes the owner of migrations (Alicerce). `apps/worker` stays thin.
- Lint/dependency rules must be added in `packages/config` to enforce the direction graph.
- A Testcontainers-based integration suite in `packages/domain` becomes the primary place to test
  invariants from `docs/architecture/data-model.md`.
- Build model per package (2026-10-16): packages consumed exclusively by a bundler (today only
  `packages/ui`) export TypeScript source and are transpiled by the consumer (Next.js
  `transpilePackages`); packages used by `api`/`worker` (`contracts`, `domain`, `editorial-engine`)
  compile to `dist` + `.d.ts` because those apps run on Node. The `no-restricted-imports` lint rule
  forbids importing `@linkedin-ops/ui` outside `apps/web` and `packages/ui` (PR #67, 4b4af5b).

## Security / compliance impact

- Secrets exist only in `apps/api` and `apps/worker` runtime environments; `apps/web` has none.
- Keeping rules in one package makes the autonomy policy and idempotency guarantees auditable in one place.
