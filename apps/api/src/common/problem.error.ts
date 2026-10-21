import type { ErrorCode, ValidationIssue } from "@linkedin-ops/contracts";

export interface ProblemErrorOptions {
  /** Occurrence-specific explanation shown to the user (PT-BR). Never internal details. */
  detail?: string;
  /** Field issues; only meaningful with `VALIDATION_FAILED`. */
  errors?: ValidationIssue[];
  /** Extra response headers (e.g. `Retry-After`). */
  headers?: Record<string, string>;
  cause?: unknown;
}

/**
 * The one exception type application code throws for an expected failure. `ProblemDetailsFilter` turns
 * it into RFC 9457 Problem Details with the HTTP status derived from `code` (contracts.md §4).
 */
export class ProblemError extends Error {
  readonly code: ErrorCode;
  readonly detail: string | undefined;
  readonly errors: ValidationIssue[] | undefined;
  readonly headers: Readonly<Record<string, string>>;

  constructor(code: ErrorCode, options: ProblemErrorOptions = {}) {
    super(
      options.detail ?? code,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = "ProblemError";
    this.code = code;
    this.detail = options.detail;
    this.errors = options.errors;
    this.headers = options.headers ?? {};
  }

  /**
   * `429 RATE_LIMITED` with `Retry-After` in whole seconds (RFC 9110 §10.2.3); the web shows a countdown
   * from it, so fractions are rounded up and the minimum is 1.
   */
  static rateLimited(retryAfterSeconds: number, detail?: string): ProblemError {
    const seconds = Math.max(1, Math.ceil(retryAfterSeconds));
    return new ProblemError("RATE_LIMITED", {
      ...(detail === undefined ? {} : { detail }),
      headers: { "Retry-After": String(seconds) },
    });
  }
}
