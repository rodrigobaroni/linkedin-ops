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

export function serializeErrorForLog(error: unknown, depth = 0): SafeLoggedError {
  if (!(error instanceof Error)) {
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
 * Applies `serializeErrorForLog` to every `Error` of a log object, under any key and nested in plain objects
 * or arrays (#102): `{ exception: pgError }`, `{ ctx: { err } }`, `[e]`. Other values are copied as they
 * are. Fails closed: a subtree deeper than `MAX_ERROR_SEARCH_DEPTH` or a cycle is replaced by a marker, so
 * no error can hide below the search depth.
 */
export function serializeErrorsDeep(
  value: unknown,
  depth = 0,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  if (value instanceof Error) return serializeErrorForLog(value);
  if (value === null || typeof value !== "object") return value;
  if (!Array.isArray(value) && !isPlainObject(value)) return value;
  if (depth >= MAX_ERROR_SEARCH_DEPTH) return ERROR_SEARCH_TRUNCATED;
  if (seen.has(value)) return ERROR_SEARCH_CIRCULAR;
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => serializeErrorsDeep(item, depth + 1, seen));
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    out[key] = serializeErrorsDeep(entry, depth + 1, seen);
  }
  return out;
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}
