# @linkedin-ops/editorial-engine

Pure editorial core (ADR-0005): prompt registry, `build*Request` / `parse*Response`, scoring, cliché/voice checks and evals. No I/O, no `process.env`, no clock/random without injection. Dependencies limited to `zod` and `@linkedin-ops/contracts`. Populated in T-021 (Pena). The `upstream/` directory is reserved for the pinned `linkedin-skills` snapshot (ADR-0006) and is excluded from lint, typecheck, tests and build.
