import { isSensitiveKey } from "@linkedin-ops/contracts";
import type { LogLevel } from "@linkedin-ops/domain";
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

/** Replaces the value of every credential-like key (`SENSITIVE_KEY_PATTERN`, packages/contracts) at any depth. */
export function scrubSensitiveKeys(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== "object" || depth > MAX_SCRUB_DEPTH) return value;
  if (value instanceof Error || value instanceof Date || Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) return value.map((item) => scrubSensitiveKeys(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSensitiveKey(key) ? REDACTED : scrubSensitiveKeys(entry, depth + 1);
  }
  return out;
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
      // Never serialize headers or bodies: method, url and the correlation id are enough to trace a request.
      req: (request: { id?: string; method?: string; url?: string }) => ({
        id: request.id,
        method: request.method,
        url: request.url,
      }),
      res: (reply: { statusCode?: number }) => ({ statusCode: reply.statusCode }),
    },
    ...(pretty ? { transport: { target: "pino-pretty", options: { colorize: true } } } : {}),
  };
}

export function createLogger(config: LoggerConfig): Logger {
  const options = buildLoggerOptions(config);
  return config.stream ? pino(options, config.stream) : pino(options);
}
