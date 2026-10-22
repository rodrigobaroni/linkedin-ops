# ADR-0011: Claude (Anthropic) as the worker's LLM provider

- Status: accepted (Rodrigo, 2026-10-22)
- Deciders: Rodrigo (product owner), Maestro
- Related: ADR-0002 (durable jobs), ADR-0005 (editorial engine as a pure package, provider-neutral `LlmClient` port)

## Context

The Career module's AI steps (`cv.extract`, `job.fetch` extraction, `cv.tailor`, humanizer) ran only on the OpenAI
Responses API (`apps/worker/src/llm/openai.ts`). The OpenAI organization of the configured key has no credit
(`429 credit_balance_exhausted`), which blocks every AI feature. Rodrigo has an Anthropic API key and decided to
use Claude.

The engine is provider-neutral by design (ADR-0005): it builds `LlmRequest` (instructions, untrusted data input,
JSON schema, output budget) and validates every output with its own Zod schemas and D4 guards. Only the adapter
knows the provider.

## Decision

1. New adapter `AnthropicLlmClient` (`apps/worker/src/llm/anthropic.ts`) implementing the same `LlmClient` port:
   - official SDK `@anthropic-ai/sdk` (pinned in the catalog, two-week soak);
   - Messages API, `system` = repository instructions, one `user` message = the untrusted data document (the
     same separation the OpenAI adapter keeps between `instructions` and `input`);
   - Structured Outputs via `output_config.format` (`json_schema`), built with the SDK's `jsonSchemaOutputFormat`
     so unsupported constraints (`maxLength`, `minimum`, …) move to descriptions; the engine still validates them;
   - streaming (`messages.stream().finalMessage()`) so long outputs with thinking never hit HTTP timeouts;
     `max_tokens` = 2 × the engine's output budget, because thinking counts towards it;
   - one SDK retry on transient errors; `stop_reason: refusal` → `REFUSAL`, `max_tokens` → `INCOMPLETE`,
     `billing_error` → `QUOTA_EXCEEDED`; errors and observer events never carry the key, prompts or outputs.
2. Environment (worker only): `ANTHROPIC_API_KEY` (enables Claude) and `ANTHROPIC_MODEL` (default
   `claude-opus-5-5`). When both providers are configured, Claude is used. In production the worker needs Claude
   or the OpenAI pair.
3. The OpenAI adapter stays as an alternative; nothing in the engine, prompts or contracts changes.

## Consequences

- Prompts were written and evaluated against OpenAI models; outputs from Claude must be checked end to end (the D4
  guards and schemas still fail closed, so a mismatch costs a regeneration, not invented content).
- Cost: Claude Opus 5.5 is $4 / $20 per million input/output tokens. `ANTHROPIC_MODEL=claude-sonnet-5-5` ($2/$10)
  or `claude-haiku-5-5` ($0.10/$0.50) are cheaper options to evaluate.
- `GenerationInfo.model` records the Claude model, so stored results stay reproducible per provider.
- Not done yet (before the next VM deploy): `infra/deploy/deploy-shared-host.sh` still checks and installs only
  `OPENAI_*`; it must accept `ANTHROPIC_*` too.
