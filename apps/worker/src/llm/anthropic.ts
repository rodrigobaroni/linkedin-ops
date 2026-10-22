/**
 * Anthropic (Claude) adapter for the engine's `LlmClient` port (ADR-0011, same contract as `openai.ts`): Messages
 * API through the official SDK, Structured Outputs (`output_config.format` json_schema), streaming so long outputs
 * never hit HTTP timeouts, a timeout per attempt and one SDK retry on transient errors (network, 408, 429
 * honouring `Retry-After`, 5xx).
 *
 * Never logged or put in errors: the API key, `instructions`, `input` and the model output. Observers receive
 * metadata only (prompt id/version, model, attempt, status, latency, token counts, error kind).
 */
import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import {
  LlmError,
  type CancellationSignal,
  type LlmCallOptions,
  type LlmClient,
  type LlmErrorKind,
  type LlmRequest,
  type LlmResponse,
} from "@linkedin-ops/editorial-engine";
import type { LlmCallEvent } from "./openai.js";

/** Long structured outputs with thinking can take minutes; streaming keeps the connection alive meanwhile. */
export const ANTHROPIC_DEFAULT_TIMEOUT_MS = 300_000;
/** One retry per call (handled by the SDK): the queue retries the job too (see the worker README). */
export const ANTHROPIC_DEFAULT_MAX_RETRIES = 1;
/**
 * Thinking is part of `max_tokens` on current Claude models, so the engine's output budget is doubled to leave
 * room for it; the engine still validates the size of what comes back.
 */
const THINKING_HEADROOM_FACTOR = 2;

export interface AnthropicClientOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  /** Injected for tests. */
  fetch?: typeof fetch;
  now?: () => number;
  onEvent?: (event: LlmCallEvent) => void;
}

export class AnthropicLlmClient implements LlmClient {
  private readonly client: Anthropic;
  private readonly now: () => number;
  private readonly onEvent: (event: LlmCallEvent) => void;

  constructor(options: AnthropicClientOptions) {
    this.client = new Anthropic({
      apiKey: options.apiKey,
      ...(options.baseUrl === undefined ? {} : { baseURL: options.baseUrl }),
      timeout: options.timeoutMs ?? ANTHROPIC_DEFAULT_TIMEOUT_MS,
      maxRetries: options.maxRetries ?? ANTHROPIC_DEFAULT_MAX_RETRIES,
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    });
    this.now = options.now ?? Date.now;
    this.onEvent = options.onEvent ?? (() => undefined);
  }

  async complete(request: LlmRequest, options: LlmCallOptions = {}): Promise<LlmResponse> {
    if (options.signal?.aborted) throw new LlmError("ABORTED");
    const started = this.now();
    try {
      const response = await this.attempt(request, options.signal);
      this.emit(request, started, { outcome: "ok", status: 200, usage: response.usage });
      return response;
    } catch (error) {
      const llmError = error instanceof LlmError ? error : toLlmError(error, options.signal);
      this.emit(request, started, {
        outcome: "error",
        status: llmError.status,
        errorKind: llmError.kind,
      });
      throw llmError;
    }
  }

  private async attempt(request: LlmRequest, external?: CancellationSignal): Promise<LlmResponse> {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (external?.aborted) controller.abort();
    else external?.addEventListener("abort", onAbort);
    let message: Anthropic.Message;
    try {
      const format = jsonSchemaOutputFormat(
        request.outputSchema.schema as Parameters<typeof jsonSchemaOutputFormat>[0],
      );
      message = await this.client.messages
        .stream(
          {
            model: request.model,
            max_tokens: request.maxOutputTokens * THINKING_HEADROOM_FACTOR,
            system: request.instructions,
            messages: [{ role: "user", content: request.input }],
            output_config: { format: { type: "json_schema", schema: format.schema } },
          },
          { signal: controller.signal },
        )
        .finalMessage();
    } finally {
      external?.removeEventListener("abort", onAbort);
    }

    if (message.stop_reason === "refusal") throw new LlmError("REFUSAL", { status: 200 });
    if (message.stop_reason === "max_tokens") throw new LlmError("INCOMPLETE", { status: 200 });
    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
    if (text === "") throw new LlmError("INVALID_OUTPUT", { status: 200 });
    let output: unknown;
    try {
      output = JSON.parse(text);
    } catch {
      throw new LlmError("INVALID_OUTPUT", { status: 200 });
    }
    return {
      output,
      model: message.model,
      usage: { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens },
    };
  }

  private emit(
    request: LlmRequest,
    started: number,
    detail: Pick<LlmCallEvent, "outcome" | "status"> & Partial<LlmCallEvent>,
  ): void {
    this.onEvent({
      promptId: request.promptId,
      promptVersion: request.promptVersion,
      model: request.model,
      attempt: 1,
      durationMs: this.now() - started,
      errorKind: null,
      usage: null,
      ...detail,
    });
  }
}

/** SDK errors become `LlmError` by class and status only; messages and bodies are never kept (they may echo input). */
function toLlmError(error: unknown, signal?: CancellationSignal): LlmError {
  if (error instanceof Anthropic.APIUserAbortError || signal?.aborted)
    return new LlmError("ABORTED");
  if (error instanceof Anthropic.APIConnectionTimeoutError) return new LlmError("TIMEOUT");
  if (error instanceof Anthropic.APIConnectionError) return new LlmError("NETWORK");
  if (error instanceof Anthropic.APIError) {
    const status = error.status ?? null;
    const type = (error.error as { error?: { type?: unknown } } | undefined)?.error?.type;
    if (type === "billing_error" || status === 402) {
      return new LlmError("QUOTA_EXCEEDED", { status });
    }
    return new LlmError(kindForStatus(status), { status });
  }
  return new LlmError("NETWORK");
}

function kindForStatus(status: number | null): LlmErrorKind {
  if (status === 401 || status === 403) return "AUTH";
  if (status === 408) return "TIMEOUT";
  if (status === 429) return "RATE_LIMITED";
  if (status !== null && status >= 500) return "UNAVAILABLE";
  return "INVALID_REQUEST";
}
