/**
 * `LlmClient` port (ADR-0005 §2). The engine builds `LlmRequest`s and parses the raw output; adapters perform
 * the call: the OpenAI adapter lives in `apps/worker`, `SimulatedLlmClient` here for tests and development.
 */
import type { PromptId, StructuredOutputSchema } from "@linkedin-ops/contracts";

export interface LlmRequest {
  promptId: PromptId;
  promptVersion: string;
  model: string;
  /** Repository constant; never contains external content (ADR-0005 §4). */
  instructions: string;
  /** JSON document carrying the untrusted data (`buildDataInput`). */
  input: string;
  outputSchema: StructuredOutputSchema;
  maxOutputTokens: number;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmResponse {
  /** Parsed JSON returned by the model; validated by `parse*Response`, never trusted before that. */
  output: unknown;
  /** Model that actually answered (persisted with the result). */
  model: string;
  usage: LlmUsage | null;
}

/** Structural subset of `AbortSignal`, so the pure package needs no DOM/Node types. */
export interface CancellationSignal {
  readonly aborted: boolean;
  addEventListener(type: "abort", listener: () => void): void;
}

export interface LlmCallOptions {
  signal?: CancellationSignal;
}

export interface LlmClient {
  complete(request: LlmRequest, options?: LlmCallOptions): Promise<LlmResponse>;
}

/**
 * - `TIMEOUT`, `RATE_LIMITED`, `UNAVAILABLE`, `NETWORK`: transient, the job may retry.
 * - `REFUSAL`, `INCOMPLETE`, `INVALID_OUTPUT`, `INVALID_REQUEST`, `AUTH`, `QUOTA_EXCEEDED`,
 *   `NOT_CONFIGURED`: permanent for this attempt (the job decides whether a new generation is worth it).
 */
export type LlmErrorKind =
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
  | "NETWORK"
  | "REFUSAL"
  | "INCOMPLETE"
  | "INVALID_OUTPUT"
  | "INVALID_REQUEST"
  | "AUTH"
  /** Billing quota exhausted (a 429 that waiting does not fix). */
  | "QUOTA_EXCEEDED"
  | "NOT_CONFIGURED";

const TRANSIENT: ReadonlySet<LlmErrorKind> = new Set([
  "TIMEOUT",
  "RATE_LIMITED",
  "UNAVAILABLE",
  "NETWORK",
]);

/** Message carries the kind and HTTP status only, never request or response bodies. */
export class LlmError extends Error {
  readonly kind: LlmErrorKind;
  readonly status: number | null;
  readonly retryAfterMs: number | null;

  constructor(
    kind: LlmErrorKind,
    options: { status?: number | null; retryAfterMs?: number | null; cause?: unknown } = {},
  ) {
    const status = options.status ?? null;
    super(
      status === null ? `LLM call failed: ${kind}` : `LLM call failed: ${kind} (HTTP ${status})`,
      {
        cause: options.cause,
      },
    );
    this.name = "LlmError";
    this.kind = kind;
    this.status = status;
    this.retryAfterMs = options.retryAfterMs ?? null;
  }

  get transient(): boolean {
    return TRANSIENT.has(this.kind);
  }
}
