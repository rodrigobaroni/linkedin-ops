import { z } from "zod";

/** Base of the `type` URI for Problem Details. The slug is the kebab-case error code. */
export const PROBLEM_TYPE_BASE = "https://linkedin-ops.local/errors/";

/** Stable error codes the web client maps to PT-BR messages (contracts.md §4). */
export const ErrorCodeSchema = z
  .enum([
    "VALIDATION_FAILED",
    "IDEMPOTENCY_KEY_REQUIRED",
    "AUTH_REQUIRED",
    "AUTH_INVALID_CREDENTIALS",
    "AUTH_REAUTH_REQUIRED",
    "FORBIDDEN",
    "CSRF_REJECTED",
    "NOT_FOUND",
    "DRAFT_INVALID_TRANSITION",
    "OPPORTUNITY_INVALID_TRANSITION",
    "ROW_VERSION_MISMATCH",
    "CURATION_RUN_IN_PROGRESS",
    "PUBLICATION_ALREADY_EXISTS",
    "SCHEDULE_ALREADY_PENDING",
    "CONTENT_PILLAR_IN_USE",
    "MEDIA_IN_USE",
    "LINKEDIN_REAUTH_REQUIRED",
    "APPROVED_VERSION_REQUIRED",
    "PUBLICATION_NOT_RETRYABLE",
    "SOURCE_URL_NOT_ALLOWED",
    "SCHEDULE_IN_PAST",
    "TIMEZONE_INVALID",
    "AUTONOMY_MODE_NOT_ENABLED",
    "RATE_LIMITED",
    "UPSTREAM_UNAVAILABLE",
    "SERVICE_NOT_READY",
    "INTERNAL",
  ])
  .meta({ id: "ErrorCode" });
export const ErrorCode = ErrorCodeSchema.enum;
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

/** HTTP status each code is served with. */
export const ERROR_CODE_HTTP_STATUS: Readonly<Record<ErrorCode, number>> = {
  VALIDATION_FAILED: 400,
  IDEMPOTENCY_KEY_REQUIRED: 400,
  AUTH_REQUIRED: 401,
  AUTH_INVALID_CREDENTIALS: 401,
  AUTH_REAUTH_REQUIRED: 401,
  FORBIDDEN: 403,
  CSRF_REJECTED: 403,
  NOT_FOUND: 404,
  DRAFT_INVALID_TRANSITION: 409,
  OPPORTUNITY_INVALID_TRANSITION: 409,
  ROW_VERSION_MISMATCH: 409,
  CURATION_RUN_IN_PROGRESS: 409,
  PUBLICATION_ALREADY_EXISTS: 409,
  SCHEDULE_ALREADY_PENDING: 409,
  CONTENT_PILLAR_IN_USE: 409,
  MEDIA_IN_USE: 409,
  LINKEDIN_REAUTH_REQUIRED: 412,
  APPROVED_VERSION_REQUIRED: 412,
  PUBLICATION_NOT_RETRYABLE: 412,
  SOURCE_URL_NOT_ALLOWED: 422,
  SCHEDULE_IN_PAST: 422,
  TIMEZONE_INVALID: 422,
  AUTONOMY_MODE_NOT_ENABLED: 422,
  RATE_LIMITED: 429,
  UPSTREAM_UNAVAILABLE: 503,
  SERVICE_NOT_READY: 503,
  INTERNAL: 500,
};

/** Builds the Problem `type` URI for a code (`DRAFT_INVALID_TRANSITION` → `.../errors/draft-invalid-transition`). */
export function problemTypeFor(code: ErrorCode): string {
  return `${PROBLEM_TYPE_BASE}${code.toLowerCase().replaceAll("_", "-")}`;
}

/** One field-level issue, present only on `VALIDATION_FAILED`. */
export const ValidationIssueSchema = z
  .object({
    path: z.array(z.union([z.string(), z.int().min(0)])).describe("Path to the offending field"),
    message: z.string().min(1).describe("Issue message"),
  })
  .meta({ id: "ValidationIssue" });
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;

/** RFC 9457 Problem Details with a stable `code` and `correlationId` (contracts.md §4). */
export const ProblemDetailsSchema = z
  .object({
    type: z.url().describe("Problem type URI"),
    title: z.string().min(1).describe("Short, human-readable summary (PT-BR)"),
    status: z.int().min(100).max(599).describe("HTTP status code"),
    detail: z
      .string()
      .optional()
      .describe("Explanation specific to this occurrence, never internal details"),
    instance: z.string().optional().describe("Request path that produced the problem"),
    code: ErrorCodeSchema,
    correlationId: z.string().min(1).describe("Request id for log correlation"),
    errors: z
      .array(ValidationIssueSchema)
      .optional()
      .describe("Field issues; only with VALIDATION_FAILED"),
  })
  .meta({ id: "ProblemDetails" });
export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>;

export const PROBLEM_CONTENT_TYPE = "application/problem+json";
