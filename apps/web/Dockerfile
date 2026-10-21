# syntax=docker/dockerfile:1.7
# @linkedin-ops/web — multi-stage image (T-003). Build context: repository root.
#   docker compose -f infra/docker/docker-compose.yml build web
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
    pnpm install --frozen-lockfile --store-dir /pnpm/store --filter "@linkedin-ops/web..."

FROM deps AS build
RUN pnpm --filter "@linkedin-ops/web..." run build

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
    pnpm install --frozen-lockfile --prod --ignore-scripts --store-dir /pnpm/store --filter "@linkedin-ops/web..." \
 && pnpm rebuild --pending -r --filter "@linkedin-ops/web..."

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app /app
COPY --from=build --chown=node:node /app/packages/contracts/dist /app/packages/contracts/dist
COPY --from=build --chown=node:node /app/apps/web/.next /app/apps/web/.next
EXPOSE 3000
USER node
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=6 CMD wget -q --spider http://127.0.0.1:3000/ || exit 1
# `next start` reads .next, next.config.ts and public/ from the working directory, so run it from the app
# (from /app it finds no build and no react). `next` resolves from apps/web/node_modules (pnpm layout);
# no shell, no pnpm at runtime.
WORKDIR /app/apps/web
CMD ["node", "node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
