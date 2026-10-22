/**
 * Error classification for job handlers (ADR-0002 §7). `PermanentJobError` skips the remaining retries and
 * goes straight to the dead-letter queue; anything else is retried by pg-boss up to the queue's `retryLimit`.
 * Messages carry reasons and ids only, never payload content.
 */
export class PermanentJobError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`Permanent job failure: ${reason}`);
    this.name = "PermanentJobError";
    this.reason = reason;
  }
}

export class RetryableJobError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`Retryable job failure: ${reason}`);
    this.name = "RetryableJobError";
    this.reason = reason;
  }
}
