# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e
# @linkedin-ops/worker — multi-stage image (T-003). Build context: repository root.
#   docker compose -f infra/docker/docker-compose.yml build worker
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
    pnpm install --frozen-lockfile --store-dir /pnpm/store --filter "@linkedin-ops/worker..."

FROM deps AS build
# Turbo is not used here, so the Prisma client of @linkedin-ops/domain is generated explicitly before the
# build (the worker imports the domain's runtime-env validation, ADR-0002).
RUN pnpm --filter "@linkedin-ops/domain" run generate \
    && pnpm --filter "@linkedin-ops/worker..." run build

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
    pnpm install --frozen-lockfile --prod --ignore-scripts --store-dir /pnpm/store --filter "@linkedin-ops/worker..." \
 && pnpm rebuild --pending -r --filter "@linkedin-ops/worker..."

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app /app
COPY --from=build --chown=node:node /app/packages/contracts/dist /app/packages/contracts/dist
COPY --from=build --chown=node:node /app/packages/editorial-engine/dist /app/packages/editorial-engine/dist
# @linkedin-ops/domain: compiled sources plus the generated Prisma client (dist/generated).
COPY --from=build --chown=node:node /app/packages/domain/dist /app/packages/domain/dist
COPY --from=build --chown=node:node /app/apps/worker/dist /app/apps/worker/dist
USER node
# No HTTP: the worker rewrites a heartbeat file while pg-boss runs and the database answers; the check fails
# when it is older than 60 s. The process refuses to start without a valid production environment.
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=4 CMD ["node", "apps/worker/dist/health/healthcheck.js"]
CMD ["node", "apps/worker/dist/index.js"]
