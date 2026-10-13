# ADR-0005: `editorial-engine` as a pure package

- Status: proposed
- Date: 2026-10-13
- Deciders: Atlas (architect); content owner Pena (AI editorial); consumers Pêndulo (worker), Alicerce (api)

## Context

The editorial logic — how the five opportunities are chosen, how a post is written in Rodrigo's voice,
how hooks are extracted, how clichés and invented experiences are detected — is the core intellectual
property and the main source of regressions. It must be testable offline with fixtures, versioned,
reproducible (which prompt and model produced which draft), independent from Claude Code/Codex/`SKILL.md`
at runtime, and resistant to prompt injection from external content.

## Decision

1. **`packages/editorial-engine` performs no I/O.** No `fetch`, no database, no file system at runtime,
   no `process.env`, no implicit `Date.now()`/`Math.random()` (a `Clock` and `Rng` are injected). It is a
   *functional core*; `apps/worker` is the *imperative shell* that performs HTTP calls.
2. **Request/response split.** For each capability the engine exposes:
   - `build<Capability>Request(input, options) → { promptId, promptVersion, model, instructions, input, outputSchema }`
   - `parse<Capability>Response(raw) → Result<T, EngineError>` (Zod validation of the Structured Output)
   - pure helpers: `dedupeSourceItems`, `scoreOpportunities`, `rankTopFive`, `detectCliches`, `checkVoice`, `findUnsupportedClaims`.
   The worker's `LlmGateway` adapter sends the request to the OpenAI Responses API with
   `text.format = { type: "json_schema", strict: true }` and hands the raw JSON back.
3. **Prompt registry.** Prompts live in `src/prompts/<id>/v<major>.<minor>.<patch>.ts`, are immutable once
   released, and are addressed by `promptId@version`. `CurationRun` and `DraftVersion.generation`
   persist `promptId`, `promptVersion`, `model`, `engineVersion`. A changed prompt is a new version;
   evals run against both.
4. **Untrusted content boundary.** External text (`SourceItem`, pasted URLs, comments) enters only via
   `input` as delimited data blocks with a per-request random delimiter and a fixed preamble stating the
   block is data, never instructions. It is never concatenated into `instructions`. The engine sanitizes
   (strip control chars, cap length, normalize whitespace) before building the request. Credentials
   never reach the engine (ADR-0004).
5. **Facts and voice inputs are explicit.** `VoiceProfile`, `StoryBankEntry` facts and `ContentPillar`
   descriptions are passed as typed input. The engine instructs the model to use only supplied facts and
   returns `citations[]` and `unsupportedClaims[]`; drafts with unsupported claims are flagged in
   `DraftVersion.eval`, never silently accepted.
6. **Evals are first-class.** `src/evals/` holds good/bad/adversarial cases (including prompt-injection
   payloads inside fake feed items) run with recorded model responses in CI (deterministic) and
   optionally live (nightly, flagged). Naturalness, factual fidelity, voice preservation and "no invented
   experiences" are rubric outputs, not vibes.
7. **Upstream adaptation.** Concepts from `linkedin-skills` are re-implemented in TypeScript with
   attribution in file headers and tracked in `docs/editorial/upstream-mapping.md` (ADR-0006). No
   `SKILL.md` is read at runtime.
8. **Dependencies**: `zod` and `@linkedin-ops/contracts` only. No OpenAI SDK in the package (types for the
   request shape are owned by the engine; the SDK lives in the worker).
9. **Model-output schemas vs. contracts (alignment 2026-10-13).** The Structured Output schemas are
   defined by Pena in `docs/editorial/structured-outputs.md`; `packages/contracts` names prevail for
   persistence and API, and `parse*Response` performs the mapping (e.g. `freshness → recency`,
   `sourceQuality → sourceTrust`, `relevance → pillarFit + audienceFit`; `novelty` is computed by the
   engine from dedupe/history, never asked of the model). Accepted additions: `scoreBreakdown.voiceFit`
   and `.risk`; `hooks` as `{ text, formula, rationale }[]`; `mediaSuggestion.altText` required whenever a
   media suggestion exists. `injectionSuspected`/`injectionEvidence` from every model output are surfaced
   in `DraftVersion.eval` / `CurationRun.stats` and fail closed (no auto-approval) when true.

## Alternatives considered

- **Engine calls OpenAI directly.** Rejected: untestable without network/mocks, hides retries and
  secrets inside editorial code, couples prompt changes to infrastructure changes.
- **Prompts as Markdown/`SKILL.md` files loaded at runtime.** Rejected by the brief (no runtime dependency
  on agent skill files) and harder to version/type.
- **LangChain-style framework.** Rejected: adds abstraction over a single provider call and obscures the
  exact request sent; Structured Outputs + Zod is enough.
- **Running the engine inside the API process.** Rejected: generation is slow; it belongs in jobs. The API
  still imports the engine for cheap pure helpers (e.g. preview scoring) without I/O.

## Consequences

- The worker owns all retries, timeouts, rate limits and usage accounting for OpenAI.
- Evals become a CI gate for prompt changes (Pena + QA define thresholds).
- Any new capability (comment drafter, profile optimizer) follows the same request/parse pattern.
- Reproducing a draft needs: engine version, prompt version, model, inputs (persisted ids) and the raw response (stored for N days — retention to be set with Sentinela).

## Security / compliance impact

- Structural defense against prompt injection: external content cannot reach `instructions`, and output
  is schema-validated before touching the database.
- No secrets in the package; it can be unit-tested and reviewed without access to credentials.
- Factual claims are tied to sources, supporting the "afirmações factuais vinculadas a fontes" rule.
