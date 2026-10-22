# @linkedin-ops/editorial-engine

Pure editorial core (ADR-0005): prompt registry, `build*Request` / `parse*Response`, scoring, cliché/voice checks and evals. No I/O, no `process.env`, no clock/random without injection. Dependencies limited to `zod` and `@linkedin-ops/contracts`. Populated in T-021 (Pena). The `upstream/` directory is reserved for the pinned `linkedin-skills` snapshot (ADR-0006) and is excluded from lint, typecheck, tests and build.

## Career module (PR 1 of the CV tailoring spec)

- `src/llm/`: `LlmClient` port, `LlmError` (transient vs permanent) and `SimulatedLlmClient` for tests and local
  development. The OpenAI adapter lives in `apps/worker` (ADR-0005 §8).
- `src/prompts/<id>/v1.0.0.ts`: `cv-extract`, `job-extract`, `cv-tailor`, `cv-humanize`, text by Pena
  (`docs/editorial/career-prompts.md`), immutable once released.
- `src/career/`: request builders (nonce-delimited data blocks, `untrusted.ts`), response parsers with the
  post-processing checks (evidence, provenance, D4 hard limits, humanizer preservation), match score 70/30
  (`MATCH_SCORE_WEIGHTS`), language rule (`FALLBACK_LANGUAGE = "en"`), report assembly and the deterministic
  checker `cv-banned-phrases@1.0.0` (`src/career/lint/`).
