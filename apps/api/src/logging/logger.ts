import { isSensitiveKey } from "@linkedin-ops/contracts";
import { serializeErrorForLog, serializeErrorsDeep, type LogLevel } from "@linkedin-ops/domain";
import type { DestinationStream, Logger, LoggerOptions } from "pino";
import { pino } from "pino";

/** Injection token for the root Pino logger (the same instance Fastify uses for request logs). */
export const API_LOGGER = Symbol("API_LOGGER");
export type ApiLogger = Logger;

export const REDACTED = "[Redacted]";

/**
 * Pino `redact` paths: credentials in request/response headers and the credential-like fields application
 * code might attach to a log line (ADR-0007; T-008 acceptance criteria). `scrubSensitiveKeys` covers any
 * depth as defense in depth, since `redact` only matches explicit paths.
 */
export const REDACT_PATHS: readonly string[] = [
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  'res.headers["x-csrf-token"]',
  "authorization",
  "cookie",
  "token",
  "apiKey",
  "csrfToken",
  "password",
  "*.authorization",
  "*.cookie",
  "*.token",
  "*.apiKey",
  "*.csrfToken",
  "*.password",
];

const MAX_SCRUB_DEPTH = 6;
/** Marker for a subtree deeper than `MAX_SCRUB_DEPTH`: it is dropped, never logged unscrubbed. */
export const TRUNCATED = "[Truncated]";
/** Marker for a reference cycle. */
export const CIRCULAR = "[Circular]";

/**
 * Replaces the value of every credential-like key (`SENSITIVE_KEY_PATTERN`, packages/contracts) at any depth.
 * Fails closed: a subtree beyond `MAX_SCRUB_DEPTH` is replaced by `TRUNCATED` and a cycle by `CIRCULAR`, so
 * no object is ever returned without having been scrubbed.
 */
export function scrubSensitiveKeys(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  if (value === null || typeof value !== "object") return value;
  // An error under any key is reduced to its allow-listed fields (#102: Prisma/pg errors carry row data).
  if (value instanceof Error) return serializeErrorForLog(value);
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  if (depth > MAX_SCRUB_DEPTH) return TRUNCATED;
  if (seen.has(value)) return CIRCULAR;
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => scrubSensitiveKeys(item, depth + 1, seen));
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSensitiveKey(key) ? REDACTED : scrubSensitiveKeys(entry, depth + 1, seen);
  }
  return out;
}

/** Marker that replaces a dropped query string in request logs. */
export const QUERY_OMITTED = "[query omitted]";

/**
 * Request target for logs: only the path. The query string is dropped because it can carry `csrfToken`,
 * OAuth `code`/`state` and tokens, and Caddy filters only its own access log, not what reaches the api.
 */
export function loggableUrl(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  const index = url.indexOf("?");
  return index === -1 ? url : `${url.slice(0, index)}?${QUERY_OMITTED}`;
}

export interface LoggerConfig {
  level: LogLevel;
  pretty: boolean;
  /** Test hook: capture output instead of stdout. */
  stream?: DestinationStream;
}

export function buildLoggerOptions({ level, pretty }: LoggerConfig): LoggerOptions {
  return {
    level,
    redact: { paths: [...REDACT_PATHS], censor: REDACTED },
    formatters: {
      level: (label) => ({ level: label }),
      // `req`, `res` and `err` are Fastify/Error instances reduced by the serializers below (which
      // only pick safe fields); scrubbing them first would strip their prototypes.
      log: ({ req, res, err, ...rest }) => ({
        ...(scrubSensitiveKeys(rest) as Record<string, unknown>),
        ...(req === undefined ? {} : { req }),
        ...(res === undefined ? {} : { res }),
        ...(err === undefined ? {} : { err }),
      }),
    },
    serializers: {
      // Never serialize headers, bodies or the query string: method, path and the correlation id are enough
      // to trace a request.
      req: (request: { id?: string; method?: string; url?: string }) => ({
        id: request.id,
        method: request.method,
        url: loggableUrl(request.url),
      }),
      res: (reply: { statusCode?: number }) => ({ statusCode: reply.statusCode }),
      // Allow-list of error fields (QA #101): Prisma/pg errors carry the offending row in `meta`/`cause`.
      // Idempotent: `error` may arrive already reduced by `formatters.log` (any other key always does).
      err: serializeErrorsDeep,
      error: serializeErrorsDeep,
    },
    ...(pretty ? { transport: { target: "pino-pretty", options: { colorize: true } } } : {}),
  };
}

export function createLogger(config: LoggerConfig): Logger {
  const options = buildLoggerOptions(config);
  return config.stream ? pino(options, config.stream) : pino(options);
}
