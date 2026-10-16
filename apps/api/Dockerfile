# syntax=docker/dockerfile:1.7
# @linkedin-ops/api — multi-stage image (T-003). Build context: repository root.
#   docker compose -f infra/docker/docker-compose.yml build api
# Stages: deps (all workspaces the app needs) -> build (compiled output) -> prod-deps (production
# node_modules only) -> runtime (non-root, no toolchain). `dev` keeps the toolchain for hot reload.

ARG NODE_IMAGE=node:24.22.0-alpine
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
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --store-dir /pnpm/store --filter "@linkedin-ops/api..."

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app /app
COPY --from=build --chown=node:node /app/packages/contracts/dist /app/packages/contracts/dist
COPY --from=build --chown=node:node /app/apps/api/dist /app/apps/api/dist
EXPOSE 3001
USER node
# TODO(T-008): HEALTHCHECK on GET /health once the NestJS app exists (placeholder exits immediately).
CMD ["node", "apps/api/dist/index.js"]
