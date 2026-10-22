/**
 * Structured logger (ADR-0001: Pino). Defence in depth: credential-like keys and content-bearing keys are
 * redacted even if a call site passes them by mistake (spec §8: CV and posting content never in logs).
 */
import { pino, type Logger } from "pino";

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

export function createLogger(level: string): Logger {
  return pino({
    level,
    base: { service: "worker" },
    redact: { paths: REDACTED_PATHS, censor: "[redacted]" },
  });
}
