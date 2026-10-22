import { isSensitiveKey } from "@linkedin-ops/contracts";

/**
 * Log serializer for errors (API and worker, QA #101): only the class, the code and a scrubbed message ever
 * reach a log line. Prisma and the pg driver attach the offending row to errors (`meta`, `cause.detail`,
 * `driverAdapterError`: "Failing row contains (…url…, …user id…)", "Key (email)=(…)"), and a validation error
 * prints the call's arguments; Pino's default serializer would copy every enumerable property of the error.
 * This one is an allow-list: nothing but `type`, `code`, `message`, `stack` and a reduced `cause` survives.
 */
export interface SafeLoggedError {
  type: string;
  code?: string;
  message: string;
  stack?: string;
  cause?: SafeLoggedError;
}

/** Message replacement for errors whose message is made of the call's arguments. */
export const ERROR_MESSAGE_OMITTED = "[message omitted]";

const MAX_MESSAGE_CHARS = 500;
const MAX_CAUSE_DEPTH = 2;

/**
 * Row and input values PostgreSQL quotes in its messages and details; cut to the end of the line. 22P02/22007
 * (`invalid input syntax for type uuid: "…"`, `invalid input value for enum …: "…"`) quote the rejected input.
 */
const ROW_DATA = [
  /Failing row contains.*$/gim,
  /DETAIL:.*$/gim,
  /Key \(.*?\)=\(.*$/gim,
  /(invalid input (?:syntax|value) for [^:\n]*:).*$/gim,
];

/** Removes every quoted row or input from `text` (each match up to the end of its line). */
export function scrubErrorText(text: string): string {
  return ROW_DATA.reduce(
    (current, pattern) =>
      current.replace(pattern, (_match, prefix?: string) =>
        typeof prefix === "string" ? `${prefix} [value omitted]` : "[row omitted]",
      ),
    text,
  );
}

/**
 * An error of this realm or of another one (a `vm` context, a worker thread: `instanceof Error` is false
 * there, `Object.prototype.toString` still says `[object Error]`).
 */
export function isErrorLike(value: unknown): value is Error {
  return (
    value instanceof Error ||
    (typeof value === "object" &&
      value !== null &&
      Object.prototype.toString.call(value) === "[object Error]")
  );
}

export function serializeErrorForLog(error: unknown, depth = 0): SafeLoggedError {
  if (!isErrorLike(error)) {
    return { type: typeof error, message: ERROR_MESSAGE_OMITTED };
  }
  const type = error.name || error.constructor.name || "Error";
  const rawCode = (error as { code?: unknown }).code;
  const code =
    typeof rawCode === "string" || typeof rawCode === "number" ? String(rawCode) : undefined;
  const isPrisma = type.startsWith("PrismaClient");
  let message: string;
  if (type === "PrismaClientValidationError") {
    // Its message is the invocation with every argument value.
    message = ERROR_MESSAGE_OMITTED;
  } else if (isPrisma) {
    // "Invalid `x.create()` invocation in … code frame …" then the database message: keep the last line.
    const lines = error.message.split("\n").map((line) => line.trim());
    message = lines.filter((line) => line !== "").at(-1) ?? "";
  } else {
    message = error.message;
  }
  message = scrubErrorText(message).slice(0, MAX_MESSAGE_CHARS);
  const out: SafeLoggedError = { type, message };
  if (code !== undefined) out.code = code;
  // The stack's first line repeats the message; the frames are file paths only.
  if (error.stack !== undefined && !isPrisma) {
    const frames = error.stack.split("\n").filter((line) => /^\s+at /.test(line));
    out.stack = [`${type}: ${message}`, ...frames].join("\n");
  }
  if (error.cause !== undefined && depth < MAX_CAUSE_DEPTH) {
    out.cause = serializeErrorForLog(error.cause, depth + 1);
  }
  return out;
}

/** Deepest level of a log object searched for errors; anything deeper is dropped, never logged raw. */
export const MAX_ERROR_SEARCH_DEPTH = 6;
export const ERROR_SEARCH_TRUNCATED = "[Truncated]";
export const ERROR_SEARCH_CIRCULAR = "[Circular]";

/**
 * Applies `serializeErrorForLog` to every error of a log object (this realm or another), under any key and
 * nested in arrays, plain objects and class instances (their own enumerable properties) (#102). Dates and
 * binary buffers are copied as they are. Fails closed: a subtree deeper than `MAX_ERROR_SEARCH_DEPTH` or a
 * cycle is replaced by a marker, so no error can hide below the search depth.
 */
export function serializeErrorsDeep(value: unknown): unknown {
  return walk(value, false, 0, new WeakSet());
}

/**
 * `serializeErrorsDeep` plus the credential-like keys of `isSensitiveKey` (packages/contracts) replaced by
 * `LOG_REDACTED` at any depth: what the worker logger applies to every log object, as the API does with its
 * `scrubSensitiveKeys`.
 */
export function scrubLogObject(value: unknown): unknown {
  return walk(value, true, 0, new WeakSet());
}

export const LOG_REDACTED = "[redacted]";

function walk(value: unknown, redactKeys: boolean, depth: number, seen: WeakSet<object>): unknown {
  if (isErrorLike(value)) return serializeErrorForLog(value);
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date || ArrayBuffer.isView(value) || value instanceof ArrayBuffer)
    return value;
  if (depth >= MAX_ERROR_SEARCH_DEPTH) return ERROR_SEARCH_TRUNCATED;
  if (seen.has(value)) return ERROR_SEARCH_CIRCULAR;
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => walk(item, redactKeys, depth + 1, seen));
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    out[key] =
      redactKeys && isSensitiveKey(key) ? LOG_REDACTED : walk(entry, redactKeys, depth + 1, seen);
  }
  return out;
}

/**
 * `hooks.logMethod` arguments for Pino (#102 follow-up): a call that logs an error without a message string
 * (`logger.error(err)`, `logger.error({ err })`) would get the raw `err.message` as `msg` ("Failing row
 * contains (…)", a 22P02 input value). This injects the scrubbed message instead; calls with a message are
 * returned unchanged.
 */
export function safeLogArguments(args: unknown[]): unknown[] {
  const [first, ...rest] = args;
  if (typeof rest[0] === "string") return args;
  if (isErrorLike(first)) return [{ err: first }, serializeErrorForLog(first).message, ...rest];
  if (first === null || typeof first !== "object") return args;
  const candidate = (first as { err?: unknown }).err ?? (first as { error?: unknown }).error;
  if (!isErrorLike(candidate)) return args;
  return [first, serializeErrorForLog(candidate).message, ...rest];
}

/** The part of a Pino logger `scrubChildBindings` needs (no Pino dependency in the domain). */
export interface ChildLogger {
  child(bindings: Record<string, unknown>, options?: unknown): this;
}

/**
 * Child bindings (`logger.child({...})`) never reach `formatters.log`, and Pino 10 resets `formatters.bindings` to
 * the identity in every child, so neither scrubs them (#102 residue 1). This wraps `child` on the root logger so
 * every binding object goes through `scrub` first; children are `Object.create(parent)`, so they inherit the
 * wrapper and grandchildren are covered too.
 */
export function scrubChildBindings<T extends ChildLogger>(
  logger: T,
  scrub: (value: unknown) => unknown = scrubLogObject,
): T {
  const child = logger.child;
  logger.child = function scrubbedChild(this: T, bindings, options) {
    return child.call(this, scrub(bindings) as Record<string, unknown>, options);
  };
  return logger;
}
