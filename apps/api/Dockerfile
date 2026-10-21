# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e
# @linkedin-ops/api — multi-stage image (T-003). Build context: repository root.
#   docker compose -f infra/docker/docker-compose.yml build api
# Stages: deps (all workspaces the app needs) -> build (compiled output) -> prod-deps (production
# node_modules only) -> runtime (non-root, no toolchain). `dev` keeps the toolchain for hot reload.

# Tag + digest (TM-21). Dependabot (docker ecosystem) is expected to bump both; see infra/docker/README.md.
ARG NODE_IMAGE=node:24.22.0-alpine@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f
ARG PNPM_VERSION=10.34.5

FROM ${NODE_IMAGE} AS base
ARG PNPM_VERSION
ENV CI=true HUSKY=0 TURBO_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1 NEXT_TELEMETRY_DISABLED=1 \
    PNPM_HOME=/pnpm PATH=/pnpm:$PATH
# pnpm version follows package.json#packageManager; corepack is deprecated in Node 24+.
RUN npm install -g "pnpm@${PNPM_VERSION}" && npm cache clean --force
WORKDIR /app

FROM base AS deps
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store --filter "@linkedin-ops/api..."

FROM deps AS build
RUN pnpm --filter "@linkedin-ops/api..." run build

# Development image (docker-compose.dev.yml): toolchain + first build, sources bind-mounted on top.
FROM build AS dev
ENV NODE_ENV=development
CMD ["node", "--version"]

FROM base AS prod-deps
COPY . .
# `--prod` drops devDependencies, so the root `prepare` script (husky) would fail with "husky: not found":
# install with `--ignore-scripts`, then `rebuild --pending` runs the dependency build scripts that
# `onlyBuiltDependencies` (pnpm-workspace.yaml) allows, e.g. argon2 and @prisma/engines once T-005 lands.
# Filtered, `rebuild` never re-runs the root project scripts; without an allowlist it is a no-op.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --ignore-scripts --store-dir /pnpm/store --filter "@linkedin-ops/api..." \
 && pnpm rebuild --pending -r --filter "@linkedin-ops/api..."

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app /app
COPY --from=build --chown=node:node /app/packages/contracts/dist /app/packages/contracts/dist
# @linkedin-ops/domain: compiled sources plus the generated Prisma client (dist/generated, emitted by
# `prisma generate` + tsc in the build stage; the query compiler WASM ships inside @prisma/client).
COPY --from=build --chown=node:node /app/packages/domain/dist /app/packages/domain/dist
COPY --from=build --chown=node:node /app/apps/api/dist /app/apps/api/dist
EXPOSE 3001
USER node
# GET /api/v1/health: liveness (HealthStatus contract) served by the NestJS app (T-008); it never touches
# the database (/ready does). The process refuses to start without a valid production environment.
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=6 CMD wget -q --spider http://127.0.0.1:3001/api/v1/health || exit 1
CMD ["node", "apps/api/dist/index.js"]
