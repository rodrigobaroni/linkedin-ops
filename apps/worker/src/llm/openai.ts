/**
 * OpenAI adapter for the engine's `LlmClient` port (ADR-0005 §2, §8): Responses API with Structured Outputs
 * (`text.format = json_schema, strict`), `store: false`, a timeout per attempt and a bounded retry on transient
 * errors only (network, 429 honouring `Retry-After`, 5xx). Plain `fetch`, no SDK.
 *
 * Never logged or put in errors: the API key, `instructions`, `input` and the model output. Observers receive
 * metadata only (prompt id/version, model, attempt, status, latency, token counts, error kind).
 */
import {
  LlmError,
  type CancellationSignal,
  type LlmCallOptions,
  type LlmClient,
  type LlmErrorKind,
  type LlmRequest,
  type LlmResponse,
  type LlmUsage,
} from "@linkedin-ops/editorial-engine";

export const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com";
export const OPENAI_DEFAULT_TIMEOUT_MS = 90_000;
export const OPENAI_DEFAULT_MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 1_000;
const RETRY_MAX_DELAY_MS = 30_000;

export interface LlmCallEvent {
  promptId: string;
  promptVersion: string;
  model: string;
  /** 1-based attempt within this call. */
  attempt: number;
  outcome: "ok" | "error";
  status: number | null;
  durationMs: number;
  errorKind: LlmErrorKind | null;
  usage: LlmUsage | null;
}

export interface OpenAiClientOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  /** Injected for tests. */
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  onEvent?: (event: LlmCallEvent) => void;
}

interface ResponsesApiBody {
  status?: string;
  model?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string; refusal?: string }>;
  }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class OpenAiLlmClient implements LlmClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly onEvent: (event: LlmCallEvent) => void;

  constructor(options: OpenAiClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? OPENAI_DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? OPENAI_DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? OPENAI_DEFAULT_MAX_RETRIES;
    this.fetchImpl = options.fetch ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
    this.now = options.now ?? Date.now;
    this.onEvent = options.onEvent ?? (() => undefined);
  }

  async complete(request: LlmRequest, options: LlmCallOptions = {}): Promise<LlmResponse> {
    for (let attempt = 1; ; attempt += 1) {
      const started = this.now();
      try {
        const response = await this.attempt(request, options.signal);
        this.emit(request, attempt, started, { outcome: "ok", status: 200, usage: response.usage });
        return response;
      } catch (error) {
        const llmError =
          error instanceof LlmError ? error : new LlmError("NETWORK", { cause: undefined });
        this.emit(request, attempt, started, {
          outcome: "error",
          status: llmError.status,
          errorKind: llmError.kind,
        });
        if (!llmError.transient || attempt > this.maxRetries || options.signal?.aborted) {
          throw llmError;
        }
        await this.sleep(this.retryDelay(llmError, attempt));
      }
    }
  }

  private async attempt(request: LlmRequest, external?: CancellationSignal): Promise<LlmResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    external?.addEventListener("abort", () => controller.abort());
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/v1/responses`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: request.model,
          instructions: request.instructions,
          input: request.input,
          store: false,
          max_output_tokens: request.maxOutputTokens,
          text: {
            format: {
              type: "json_schema",
              name: request.outputSchema.name,
              schema: request.outputSchema.schema,
              strict: true,
            },
          },
        }),
        signal: controller.signal,
      });
    } catch {
      // The cause may carry request details: never attach it.
      throw new LlmError(controller.signal.aborted ? "TIMEOUT" : "NETWORK");
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      // Only the error code is read (to tell an exhausted quota from a rate limit); the body is never kept.
      const codes = await response
        .json()
        .then((raw: unknown) => {
          const error = (raw as { error?: { code?: unknown; type?: unknown } } | null)?.error;
          return [error?.code, error?.type];
        })
        .catch(() => []);
      if (
        response.status === 429 &&
        codes.some((code) => code === "insufficient_quota" || code === "credit_balance_exhausted")
      ) {
        throw new LlmError("QUOTA_EXCEEDED", { status: 429 });
      }
      throw new LlmError(kindForStatus(response.status), {
        status: response.status,
        retryAfterMs: parseRetryAfter(response.headers.get("retry-after")),
      });
    }

    let body: ResponsesApiBody;
    try {
      body = (await response.json()) as ResponsesApiBody;
    } catch {
      throw new LlmError("INVALID_OUTPUT", { status: response.status });
    }
    const content = (body.output ?? [])
      .filter((item) => item.type === "message")
      .flatMap((item) => item.content ?? []);
    if (content.some((part) => part.type === "refusal")) {
      throw new LlmError("REFUSAL", { status: response.status });
    }
    if (body.status !== undefined && body.status !== "completed") {
      throw new LlmError("INCOMPLETE", { status: response.status });
    }
    const text = content.find((part) => part.type === "output_text")?.text;
    if (text === undefined) throw new LlmError("INVALID_OUTPUT", { status: response.status });
    let output: unknown;
    try {
      output = JSON.parse(text);
    } catch {
      throw new LlmError("INVALID_OUTPUT", { status: response.status });
    }
    const usage =
      body.usage?.input_tokens !== undefined && body.usage.output_tokens !== undefined
        ? { inputTokens: body.usage.input_tokens, outputTokens: body.usage.output_tokens }
        : null;
    return { output, model: body.model ?? request.model, usage };
  }

  private retryDelay(error: LlmError, attempt: number): number {
    if (error.retryAfterMs !== null) return Math.min(error.retryAfterMs, RETRY_MAX_DELAY_MS);
    return Math.min(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), RETRY_MAX_DELAY_MS);
  }

  private emit(
    request: LlmRequest,
    attempt: number,
    started: number,
    detail: Pick<LlmCallEvent, "outcome" | "status"> & Partial<LlmCallEvent>,
  ): void {
    this.onEvent({
      promptId: request.promptId,
      promptVersion: request.promptVersion,
      model: request.model,
      attempt,
      durationMs: this.now() - started,
      errorKind: null,
      usage: null,
      ...detail,
    });
  }
}

function kindForStatus(status: number): LlmErrorKind {
  if (status === 401 || status === 403) return "AUTH";
  if (status === 408) return "TIMEOUT";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "UNAVAILABLE";
  return "INVALID_REQUEST";
}

/** `Retry-After` in seconds or as an HTTP date; `null` when absent or unparsable. */
export function parseRetryAfter(value: string | null, now: number = Date.now()): number | null {
  if (value === null) return null;
  if (/^\d+$/.test(value.trim())) return Number(value.trim()) * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}
