# @linkedin-ops/domain

**Status: proposed — awaiting Rodrigo's ratification** of the structure amendment in `docs/adr/0001-monorepo-and-base-stack.md` ("Structure amendment", Q1 in `docs/architecture/system-overview.md`). This package is a placeholder so that `apps/api` and `apps/worker` can share entities, the content state machine, the autonomy policy, application services and the Prisma schema/repositories exactly once. If the amendment is rejected, delete this directory and its reference in the root `tsconfig.json`; nothing else depends on it yet. Populated in T-005 (Alicerce).
