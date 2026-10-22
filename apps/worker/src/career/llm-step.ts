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

/**
 * Same step with in-handler regenerations for invalid model output (spec §9: up to 2 new attempts), so a schema
 * failure never consumes a queue retry (and never re-runs the work before it, e.g. a page fetch). Transient LLM
 * errors still surface as `RetryableJobError`; when regenerations run out the failure is permanent.
 */
export async function runLlmStepWithRegenerations<T>(
  llm: LlmClient,
  build: () => BuiltRequest,
  parse: (raw: unknown) => Result<T, EngineError>,
  signal: AbortSignal,
  maxRegenerations: number,
  onInvalid: (attempt: number, reason: string) => void = () => undefined,
): Promise<LlmStepOutcome<T> & { built: BuiltRequest }> {
  for (let attempt = 1; ; attempt += 1) {
    const built = build();
    try {
      return { ...(await runLlmStep(llm, built, parse, signal)), built };
    } catch (error) {
      const invalid =
        error instanceof RetryableJobError &&
        /^(ai:|llm:(INVALID_OUTPUT|INCOMPLETE))/.test(error.reason);
      if (!invalid) throw error;
      onInvalid(attempt, error.reason);
      if (attempt > maxRegenerations)
        throw new PermanentJobError(`${error.reason}:regenerations-exhausted`);
    }
  }
}
