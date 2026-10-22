/**
 * Deterministic `LlmClient` for tests and local development (no network, no key). Each prompt id maps to a
 * fixed output or to a function of the request; unmapped prompts fail with `NOT_CONFIGURED`.
 */
import type { PromptId } from "@linkedin-ops/contracts";
import { LlmError, type LlmClient, type LlmRequest, type LlmResponse } from "./port.js";

/** `call` is the 0-based index of calls to the same prompt. */
export type SimulatedResponder = (request: LlmRequest, call: number) => unknown;
/** A fixed JSON-like output (cloned per call) or a responder. */
export type SimulatedOutput = SimulatedResponder | Record<string, unknown> | readonly unknown[];

export interface SimulatedCall {
  promptId: PromptId;
  promptVersion: string;
  model: string;
}

export class SimulatedLlmClient implements LlmClient {
  /** Metadata of every call, in order (no instructions or input, mirroring what adapters may log). */
  readonly calls: SimulatedCall[] = [];
  private readonly outputs: Partial<Record<PromptId, SimulatedOutput>>;

  constructor(outputs: Partial<Record<PromptId, SimulatedOutput>>) {
    this.outputs = outputs;
  }

  complete(request: LlmRequest): Promise<LlmResponse> {
    this.calls.push({
      promptId: request.promptId,
      promptVersion: request.promptVersion,
      model: request.model,
    });
    if (!(request.promptId in this.outputs)) {
      return Promise.reject(new LlmError("NOT_CONFIGURED"));
    }
    const configured = this.outputs[request.promptId];
    const callIndex = this.calls.filter((call) => call.promptId === request.promptId).length - 1;
    try {
      const output: unknown =
        typeof configured === "function"
          ? configured(request, callIndex)
          : (JSON.parse(JSON.stringify(configured)) as unknown);
      return Promise.resolve({ output, model: `simulated:${request.model}`, usage: null });
    } catch (error) {
      return Promise.reject(
        error instanceof LlmError ? error : new LlmError("UNAVAILABLE", { cause: error }),
      );
    }
  }
}
