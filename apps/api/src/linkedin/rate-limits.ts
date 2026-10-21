/** Injection token for the LinkedIn rate limits (tests may raise a ceiling; production uses the ADR values). */
export const LINKEDIN_RATE_LIMITS = Symbol("LINKEDIN_RATE_LIMITS");

export interface LinkedInRateLimits {
  windowMs: number;
  /** OAuth start, per session. */
  connectPerSession: number;
  /** OAuth callback, per client IP. */
  callbackPerIp: number;
  /** New "publish now" attempts, per user (replays of the same key are not counted). */
  publishPerUser: number;
}

/** ADR-0007 item 10 (Sentinela's table): all windows are 10 minutes. */
export const ADR_0007_RATE_LIMITS: Readonly<LinkedInRateLimits> = {
  windowMs: 10 * 60 * 1000,
  connectPerSession: 5,
  callbackPerIp: 20,
  publishPerUser: 3,
};
