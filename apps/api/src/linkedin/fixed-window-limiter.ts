import { ProblemError } from "../common/problem.error.js";

/**
 * Per-key fixed-window counter kept in process memory. Enough for the single-instance MVP-0 (Sentinela
 * condition 10: connect and publish are rate limited); a restart resets the windows, which only ever
 * loosens the limit for a few minutes. TODO(T-015 follow-up): move to the shared persistent limiter.
 */
export class FixedWindowLimiter {
  readonly #hits = new Map<string, { windowStart: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Counts one hit for `key`; throws `429 RATE_LIMITED` with `Retry-After` once the window is full. */
  consume(key: string, detail: string): void {
    const now = this.now();
    const entry = this.#hits.get(key);
    if (!entry || now - entry.windowStart >= this.windowMs) {
      this.#prune(now);
      this.#hits.set(key, { windowStart: now, count: 1 });
      return;
    }
    if (entry.count >= this.limit) {
      throw ProblemError.rateLimited((entry.windowStart + this.windowMs - now) / 1000, detail);
    }
    entry.count += 1;
  }

  #prune(now: number): void {
    for (const [key, entry] of this.#hits) {
      if (now - entry.windowStart >= this.windowMs) this.#hits.delete(key);
    }
  }
}
