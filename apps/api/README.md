# @linkedin-ops/api

REST API under `/api/v1` (NestJS 12 on Fastify, OpenAPI, RFC 9457 Problem Details). HTTP adapters only: auth,
validation and controllers over `@linkedin-ops/domain`; business rules never live here. Scaffolded in T-008 (Alicerce).

## Run

```bash
cp .env.example .env            # at the repo root; dev defaults are already filled in
pnpm --filter @linkedin-ops/api dev     # tsx watch, reads ../../.env, listens on API_PORT (3001)
pnpm --filter @linkedin-ops/api test    # Vitest + Supertest, no database needed
pnpm --filter @linkedin-ops/api test:integration   # /ready + auth against PostgreSQL (Testcontainers;
                                                    # or TEST_DATABASE_URL=<empty db> without Docker)
pnpm setup:user [-- --email you@example.com --name "Você"]  # first OWNER; password typed, no echo
```

`pnpm setup:user` creates the first and only OWNER (T-015); it refuses when an OWNER already exists or stdin is
not a terminal, and never takes the password from arguments or environment. In the production image:
`docker compose run --rm -it api node apps/api/dist/cli/setup-user.js` (after `pnpm db:migrate`).

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
| `src/session/`                   | binds the domain `SessionService` port to `PrismaSessionService`; cookie writer              |
| `src/health/`, `src/auth/`       | `/health`, `/ready`, `/auth/login`, `/auth/reauth`, `/auth/logout(-all)`, `/auth/me`         |
| `src/cli/setup-user.ts`          | `pnpm setup:user` (first OWNER via TTY)                                                      |
| `src/openapi/`                   | `GET /openapi.json` (public in dev, session elsewhere) and Swagger UI at `/docs` (dev)       |

## Conventions

- Every handler is bound to `routes/v1.ts` through `@ContractRoute` (or declares `@RouteAuth` when outside the
  registry); `test/route-parity.test.ts` walks the `AppModule` tree and fails on any handler without either.
- Sessions, throttling and rotation live in `packages/domain/src/auth` (ADR-0007): the API only adapts them.
  Client IP for throttling comes from the socket unless the peer is in `TRUSTED_PROXY_CIDRS`.
- Throw `ProblemError(code, { detail })` for expected failures; anything else becomes `500 INTERNAL` with the
  stack logged under the request's `correlationId`.
- Never log request bodies or headers. The serializers only keep method, url, status and the correlation id.

## Swagger UI em desenvolvimento

`/docs` fica fora do prefixo `/api`, então atrás do Caddy a rota cai no `web`. Em desenvolvimento, abra
diretamente `http://127.0.0.1:3001/docs`. O documento OpenAPI continua em `GET /api/v1/openapi.json`.
