/**
 * Structured logger (ADR-0001: Pino). Defence in depth: credential-like keys and content-bearing keys are
 * redacted even if a call site passes them by mistake (spec §8: CV and posting content never in logs).
 */
import { serializeErrorForLog } from "@linkedin-ops/domain";
import { pino, type DestinationStream, type Logger } from "pino";

export const REDACTED_PATHS = [
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
    // Allow-list of error fields (QA #101): Prisma/pg errors carry the offending row in `meta`/`cause`.
    serializers: { err: serializeErrorForLog, error: serializeErrorForLog },
  };
  return destination === undefined ? pino(options) : pino(options, destination);
}
