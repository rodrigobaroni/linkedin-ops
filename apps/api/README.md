# @linkedin-ops/api

REST API under `/api/v1` (NestJS 12 on Fastify, OpenAPI, RFC 9457 Problem Details). HTTP adapters only: auth,
validation and controllers over `@linkedin-ops/domain`; business rules never live here. Scaffolded in T-008 (Alicerce).

## Run

```bash
cp .env.example .env            # at the repo root; dev defaults are already filled in
pnpm --filter @linkedin-ops/api dev     # tsx watch, reads ../../.env, listens on API_PORT (3001)
pnpm --filter @linkedin-ops/api test    # Vitest + Supertest, no database needed
pnpm --filter @linkedin-ops/api test:integration   # GET /ready against PostgreSQL (Testcontainers)
```

Boot validates the environment first (`validateRuntimeEnv`, `packages/domain`): missing `DATABASE_URL`, a weak
`SESSION_SECRET`, a malformed key ring or a `change-me*` placeholder outside `development` stop the process with
the variable names (never the values).

## Layout

| Path                             | Role                                                                                         |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| `src/main.ts`                    | env validation → logger → `createApp` → listen                                               |
| `src/app.factory.ts`             | Fastify adapter (Pino, request ids, body limit, strict parsers), helmet, cookies, prefix     |
| `src/app.module.ts`              | wires modules, global guard and exception filter; `/docs` only in development                |
| `src/common/contract-route.*`    | `@ContractRoute("auth.login")`: method, path, status, cache policy and auth from contracts   |
| `src/common/zod-validation.pipe` | `@ContractBody/Query/Params` validate with the route's Zod schemas → `400 VALIDATION_FAILED` |
| `src/common/route-access.guard`  | ADR-0007 N4 (Origin, JSON, `X-Requested-With`, no method override) + session/elevated/roles  |
| `src/common/problem-details.*`   | single error format: `code`, PT-BR `title`, `correlationId`, `application/problem+json`      |
| `src/logging/`                   | Pino options: redaction (`authorization`, `cookie`, `token`, `apiKey`, `csrfToken`, …)       |
| `src/session/`                   | `SessionService` boundary; in-memory stub that never authenticates (replaced in T-015)       |
| `src/health/`, `src/auth/`       | `/health`, `/ready`, `/auth/login`, `/auth/reauth`, `/auth/me`                               |
| `src/openapi/`                   | `GET /openapi.json` (public in dev, session elsewhere) and Swagger UI at `/docs` (dev)       |

## Conventions

- Every handler is bound to `routes/v1.ts` through `@ContractRoute`; `test/route-parity.test.ts` lists what is
  implemented and fails on any handler outside the registry.
- Throw `ProblemError(code, { detail })` for expected failures; anything else becomes `500 INTERNAL` with the
  stack logged under the request's `correlationId`.
- Never log request bodies or headers. The serializers only keep method, url, status and the correlation id.

## Swagger UI em desenvolvimento

`/docs` fica fora do prefixo `/api`, então atrás do Caddy a rota cai no `web`. Em desenvolvimento, abra
diretamente `http://127.0.0.1:3001/docs`. O documento OpenAPI continua em `GET /api/v1/openapi.json`.
