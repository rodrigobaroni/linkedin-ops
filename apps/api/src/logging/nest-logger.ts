import type { LoggerService } from "@nestjs/common";
import { isErrorLike, scrubErrorText, serializeErrorForLog } from "@linkedin-ops/domain";
import type { Logger } from "pino";

/**
 * Routes Nest's internal logger (bootstrap, DI errors) through the shared Pino instance. Nest hands over
 * whatever it caught: an error goes through the allow-list serializer, a message or a stack trace through
 * `scrubErrorText` (row data quoted by PostgreSQL never reaches the log, #102).
 */
export class PinoNestLogger implements LoggerService {
  constructor(private readonly logger: Logger) {}

  log(message: unknown, context?: string): void {
    this.logger.info({ context }, safeMessage(message));
  }
  error(message: unknown, trace?: string, context?: string): void {
    if (isErrorLike(message)) {
      this.logger.error({ context, err: message }, serializeErrorForLog(message).message);
      return;
    }
    this.logger.error(
      { context, ...(trace === undefined ? {} : { trace: scrubErrorText(String(trace)) }) },
      safeMessage(message),
    );
  }
  warn(message: unknown, context?: string): void {
    this.logger.warn({ context }, safeMessage(message));
  }
  debug(message: unknown, context?: string): void {
    this.logger.debug({ context }, safeMessage(message));
  }
  verbose(message: unknown, context?: string): void {
    this.logger.trace({ context }, safeMessage(message));
  }
}

function safeMessage(message: unknown): string {
  return isErrorLike(message)
    ? serializeErrorForLog(message).message
    : scrubErrorText(String(message));
}
