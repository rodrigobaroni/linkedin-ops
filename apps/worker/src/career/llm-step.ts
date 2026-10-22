/**
 * One model step: build → call → parse. Invalid output and transient LLM errors are retryable (the queue
 * retries the job, spec §9: up to 2); permanent LLM errors (auth, refusal, bad request) are not.
 */
import {
  LlmError,
  type BuiltRequest,
  type EngineError,
  type LlmClient,
  type Result,
} from "@linkedin-ops/editorial-engine";
import { PermanentJobError, RetryableJobError } from "../jobs/errors.js";

export interface LlmStepOutcome<T> {
  value: T;
  model: string;
}

export async function runLlmStep<T>(
  llm: LlmClient,
  built: BuiltRequest,
  parse: (raw: unknown) => Result<T, EngineError>,
  signal: AbortSignal,
): Promise<LlmStepOutcome<T>> {
  let response;
  try {
    response = await llm.complete(built.request, { signal });
  } catch (error) {
    if (error instanceof LlmError) {
      if (error.transient || error.kind === "INVALID_OUTPUT" || error.kind === "INCOMPLETE") {
        throw new RetryableJobError(`llm:${error.kind}`);
      }
      throw new PermanentJobError(`llm:${error.kind}`);
    }
    throw error;
  }
  const parsed = parse(response.output);
  if (!parsed.ok) throw new RetryableJobError(`ai:${parsed.error.code}`);
  return { value: parsed.value, model: response.model };
}
