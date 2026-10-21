import {
  ERROR_CODE_HTTP_STATUS,
  type ErrorCode,
  PROBLEM_CONTENT_TYPE,
  ProblemDetailsSchema,
  type ValidationIssue,
} from "@linkedin-ops/contracts";

/**
 * Error raised by the API client for a non-2xx response (RFC 9457 Problem Details, contracts.md §4).
 * The UI maps `code` to PT-BR copy; `title`/`detail` come from the API and are shown only as fallback.
 */
export class ApiProblem extends Error {
  override readonly name = "ApiProblem";
  readonly code: ErrorCode;
  readonly status: number;
  readonly title: string;
  readonly detail: string | undefined;
  readonly correlationId: string | undefined;
  readonly errors: readonly ValidationIssue[] | undefined;
  /** Seconds to wait before retrying (`Retry-After`), when the API sent one. */
  readonly retryAfterSeconds: number | undefined;

  constructor(input: {
    code: ErrorCode;
    status: number;
    title: string;
    detail?: string;
    correlationId?: string;
    errors?: readonly ValidationIssue[];
    retryAfterSeconds?: number;
  }) {
    super(input.detail ?? input.title);
    this.code = input.code;
    this.status = input.status;
    this.title = input.title;
    this.detail = input.detail;
    this.correlationId = input.correlationId;
    this.errors = input.errors;
    this.retryAfterSeconds = input.retryAfterSeconds;
  }

  is(code: ErrorCode): boolean {
    return this.code === code;
  }
}

/** The request never reached the API (offline, DNS, CORS, aborted) or the response was unreadable. */
export class ApiNetworkError extends Error {
  override readonly name = "ApiNetworkError";

  constructor(cause: unknown) {
    super("Network error", { cause });
  }
}

export function isApiProblem(error: unknown, code?: ErrorCode): error is ApiProblem {
  return error instanceof ApiProblem && (code === undefined || error.code === code);
}

export function isApiNetworkError(error: unknown): error is ApiNetworkError {
  return error instanceof ApiNetworkError;
}

/** Status → code used when the body is not a valid Problem (proxy/Caddy errors, HTML pages). */
function fallbackCode(status: number): ErrorCode {
  if (status === 401) return "AUTH_REQUIRED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 429) return "RATE_LIMITED";
  if (status === 503) return "UPSTREAM_UNAVAILABLE";
  return "INTERNAL";
}

/**
 * `Retry-After` is an integer number of seconds (Alicerce emits integers) or an HTTP date. Anything
 * else yields `undefined` and the UI falls back to its own default.
 */
export function parseRetryAfter(
  value: string | null,
  now: number = Date.now(),
): number | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.ceil((date - now) / 1000));
}

/** Builds an `ApiProblem` from a non-2xx response without throwing on malformed bodies. */
export async function problemFromResponse(response: Response): Promise<ApiProblem> {
  const retryAfterSeconds = parseRetryAfter(response.headers.get("Retry-After"));
  const contentType = response.headers.get("Content-Type") ?? "";
  let body: unknown;
  if (contentType.includes(PROBLEM_CONTENT_TYPE) || contentType.includes("application/json")) {
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
  }
  const parsed = ProblemDetailsSchema.safeParse(body);
  if (parsed.success) {
    const problem = parsed.data;
    return new ApiProblem({
      code: problem.code,
      status: problem.status,
      title: problem.title,
      detail: problem.detail,
      correlationId: problem.correlationId,
      errors: problem.errors,
      retryAfterSeconds,
    });
  }
  const code = fallbackCode(response.status);
  return new ApiProblem({
    code,
    status: ERROR_CODE_HTTP_STATUS[code],
    title: response.statusText || code,
    retryAfterSeconds,
  });
}
