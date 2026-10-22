/**
 * Structured logger (ADR-0001: Pino). Defence in depth: credential-like keys and content-bearing keys are
 * redacted even if a call site passes them by mistake (spec §8: CV and posting content never in logs).
 */
import { safeLogArguments, scrubLogObject, serializeErrorsDeep } from "@linkedin-ops/domain";
import { pino, type DestinationStream, type LogFn, type Logger } from "pino";

export const REDACTED_PATHS = [
  // Credentials, as in the API logger (REDACT_PATHS); `scrubLogObject` covers any depth.
  "cookie",
  "*.cookie",
  "password",
  "*.password",
  "csrfToken",
  "*.csrfToken",
  "token",
  "*.token",
  "apiKey",
  "*.apiKey",
  "authorization",
  "*.authorization",
  "databaseUrl",
  "*.databaseUrl",
  "connectionString",
  "*.connectionString",
  "text",
  "*.text",
  "input",
  "*.input",
  "instructions",
  "*.instructions",
  "output",
  "*.output",
  "cv",
  "*.cv",
  "job",
  "*.job",
  "rawText",
  "*.rawText",
  "injectionEvidence",
  "*.injectionEvidence",
];

/** `destination` is a test hook (stdout otherwise). */
export function createLogger(level: string, destination?: DestinationStream): Logger {
  const options = {
    level,
    base: { service: "worker" },
    redact: { paths: REDACTED_PATHS, censor: "[redacted]" },
    // `logger.error(err)` / `logger.error({ err })` without a message would log the raw `err.message` as
    // `msg`: the scrubbed one is injected instead.
    hooks: {
      logMethod(this: Logger, args: Parameters<LogFn>, method: LogFn) {
        method.apply(this, safeLogArguments(args) as Parameters<LogFn>);
      },
    },
    // Allow-list of error fields (QA #101): Prisma/pg errors carry the offending row in `meta`/`cause`. Any
    // other key, nested too (class instances and errors of another realm included), goes through
    // `formatters.log` (#102), which also redacts credential-like keys at any depth; the serializers are
    // idempotent.
    formatters: {
      log: (object: Record<string, unknown>) => scrubLogObject(object) as Record<string, unknown>,
    },
    serializers: { err: serializeErrorsDeep, error: serializeErrorsDeep },
  };
  return destination === undefined ? pino(options) : pino(options, destination);
}
