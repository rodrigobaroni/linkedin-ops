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
  type TailorIssue,
} from "@linkedin-ops/editorial-engine";
import { CancelledJobError, PermanentJobError, RetryableJobError } from "../jobs/errors.js";

/**
 * Invalid model output: retryable, carrying the structured issues the next attempt is told about (issue #99). The
 * issues' excerpts come from the model's output: never log them (only `code` and `where`).
 */
export class InvalidOutputError extends RetryableJobError {
  constructor(
    reason: string,
    readonly feedback: readonly TailorIssue[],
  ) {
    super(reason);
    this.name = "InvalidOutputError";
  }
}

/** A schema failure reported by the LLM client itself (Structured Outputs). */
const SCHEMA_INVALID: readonly TailorIssue[] = [{ code: "schema_invalid", where: "(root)" }];

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
      // ABORTED = shutdown or job expiry: the job runs again later, the posting is not failed.
      if (error.kind === "ABORTED" || signal.aborted) throw new CancelledJobError();
      if (error.kind === "INVALID_OUTPUT" || error.kind === "INCOMPLETE") {
        throw new InvalidOutputError(`llm:${error.kind}`, SCHEMA_INVALID);
      }
      if (error.transient) throw new RetryableJobError(`llm:${error.kind}`);
      throw new PermanentJobError(`llm:${error.kind}`);
    }
    throw error;
  }
  const parsed = parse(response.output);
  if (!parsed.ok) {
    throw new InvalidOutputError(`ai:${parsed.error.code}`, parsed.error.feedback ?? []);
  }
  return { value: parsed.value, model: response.model };
}

/**
 * Same step with in-handler regenerations for invalid model output (spec §9: up to 2 new attempts), so a schema
 * failure never consumes a queue retry (and never re-runs the work before it, e.g. a page fetch). Each new attempt
 * is built with the issues of the last invalid one (`previous`, issue #99): only the last attempt's, never the
 * history nor the previous output. Transient LLM errors still surface as `RetryableJobError`: the queue retries
 * the job, which starts again without feedback (Maestro D2 on issue #99: retry semantics unchanged). When
 * regenerations run out the failure is permanent. `onInvalid` gets the issues without their excerpts (`code` and
 * `where` only), so a caller cannot log the model's output by mistake.
 */
export async function runLlmStepWithRegenerations<T>(
  llm: LlmClient,
  build: (previous: readonly TailorIssue[] | undefined, attempt: number) => BuiltRequest,
  parse: (raw: unknown) => Result<T, EngineError>,
  signal: AbortSignal,
  maxRegenerations: number,
  onInvalid: (attempt: number, reason: string, issues: LoggableIssue[]) => void = () => undefined,
): Promise<LlmStepOutcome<T> & { built: BuiltRequest }> {
  let previous: readonly TailorIssue[] | undefined;
  for (let attempt = 1; ; attempt += 1) {
    const built = build(previous, attempt);
    try {
      return { ...(await runLlmStep(llm, built, parse, signal)), built };
    } catch (error) {
      if (!(error instanceof InvalidOutputError)) throw error;
      onInvalid(attempt, error.reason, loggableIssues(error.feedback));
      if (attempt > maxRegenerations)
        throw new PermanentJobError(`${error.reason}:regenerations-exhausted`);
      previous = error.feedback.length > 0 ? error.feedback : undefined;
    }
  }
}

/** What a log line may carry about an issue of an invalid output: never its excerpt. */
export interface LoggableIssue {
  code: string;
  where: string;
}

function loggableIssues(issues: readonly TailorIssue[]): LoggableIssue[] {
  return issues.map(({ code, where }) => ({ code, where }));
}
