/**
 * Per-hop policy of `job.fetch` (ADR-0008 §1, §4; Atlas condition on #89 item 3). Every hop — the URL Rodrigo
 * pasted and each redirect target, including shorteners like `lnkd.in` and third-party redirects — is judged by
 * its DESTINATION domain: LinkedIn path validation, login redirects, kill switch, limiter and breaker, in that
 * order. A redirect target is treated exactly like a typed URL.
 */
import { setTimeout as sleepFor } from "node:timers/promises";
import {
  JOB_FETCH_LINKEDIN_DOMAIN,
  fetchDomainPolicy,
  jobFetchGroupId,
  type FetchDomainGuard,
  type FetchSlot,
  type FetchStopSignal,
} from "@linkedin-ops/domain";
import { SafeHttpError } from "../http/safe-http-client.js";
import { JobFetchDeferredError, JobFetchError } from "./ports.js";

/**
 * Wall-clock ceiling of one fetch attempt: 15 s of network (SafeHttpClient) plus at most 3 in-chain waits of
 * ≤ 15 s for a redirect hop, with margin for the guard's transactions. A wait that would end past it reschedules
 * the job instead. Well under the 300 s `expireInSeconds` of `job.fetch`.
 */
export const JOB_FETCH_CEILING_MS = 90_000;

const LOGIN_PATH = /^\/(?:login|authwall|checkpoint|uas)(?:\/|$)/i;
const LINKEDIN_JOB_PATH = /^\/jobs\/view\/(\d{1,20})\/?$/;
const LINKEDIN_SHORTENER = "lnkd.in";

export function isLoginPath(pathname: string): boolean {
  return LOGIN_PATH.test(pathname);
}

/**
 * The only accepted LinkedIn page, `https://www.linkedin.com/jobs/view/<numeric id>`, normalized (www host,
 * https, no query, no fragment); `null` for any other LinkedIn path. `lnkd.in` is kept as is: it is a redirect.
 */
export function normalizeLinkedInUrl(url: URL): URL | null {
  if (url.hostname.toLowerCase() === LINKEDIN_SHORTENER) return url;
  const id = LINKEDIN_JOB_PATH.exec(url.pathname)?.[1];
  return id === undefined ? null : new URL(`https://www.linkedin.com/jobs/view/${id}`);
}

export interface HopEvent {
  hop: number;
  domain: string;
  outcome: FetchSlot["outcome"] | "login_redirect" | "not_a_job_path" | "waited";
}

export interface JobFetchPolicyDeps {
  guard: FetchDomainGuard;
  now: () => Date;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  /** Domain and outcome only, never the URL. */
  onEvent?: (event: HopEvent) => void;
}

const defaultSleep = (ms: number, signal: AbortSignal) => sleepFor(ms, undefined, { signal });

/** The policy of one fetch attempt; `beforeHop` plugs into `SafeHttpClient.get`. */
export class JobFetchHops {
  private readonly startedAt: number;
  private sentDomain: string | null = null;
  private readonly sleep: (ms: number, signal: AbortSignal) => Promise<void>;

  constructor(
    private readonly deps: JobFetchPolicyDeps,
    private readonly signal: AbortSignal,
  ) {
    this.startedAt = deps.now().getTime();
    this.sleep = deps.sleep ?? defaultSleep;
  }

  /** Domain of the last hop that was granted (the one whose response is being read). */
  get domain(): string | null {
    return this.sentDomain;
  }

  readonly beforeHop = async (url: URL, hop: number): Promise<URL | undefined> => {
    const domain = jobFetchGroupId(url.href);
    if (hop > 0 && isLoginPath(url.pathname)) {
      this.deps.onEvent?.({ hop, domain, outcome: "login_redirect" });
      return this.stop(domain, "login_redirect");
    }
    let target = url;
    if (domain === JOB_FETCH_LINKEDIN_DOMAIN) {
      const normalized = normalizeLinkedInUrl(url);
      if (normalized === null) {
        this.deps.onEvent?.({ hop, domain, outcome: "not_a_job_path" });
        throw new JobFetchError("permanent");
      }
      target = normalized;
    }
    await this.acquire(domain, hop);
    this.sentDomain = domain;
    return target === url ? undefined : target;
  };

  /** A stop signal from the domain: open its breaker for 24 h and fail with `fetch_blocked`. */
  async stop(domain: string, signal: FetchStopSignal): Promise<never> {
    await this.deps.guard.tripBreaker(domain, signal);
    throw new JobFetchError("blocked");
  }

  private async acquire(domain: string, hop: number): Promise<void> {
    let slot = await this.deps.guard.acquire(domain);
    this.deps.onEvent?.({ hop, domain, outcome: slot.outcome });
    if (slot.outcome === "wait" && hop > 0 && this.canWaitInChain(domain, slot.retryAt)) {
      // A redirect inside one domain (lnkd.in → www.linkedin.com) always meets its own interval: rescheduling
      // would redo the first hop and wait again forever. Wait in place once, then ask again (Maestro D1).
      await this.sleep(
        Math.max(0, slot.retryAt.getTime() - this.deps.now().getTime()),
        this.signal,
      );
      this.deps.onEvent?.({ hop, domain, outcome: "waited" });
      slot = await this.deps.guard.acquire(domain);
      this.deps.onEvent?.({ hop, domain, outcome: slot.outcome });
    }
    switch (slot.outcome) {
      case "granted":
        return;
      case "wait":
        throw new JobFetchDeferredError(slot.retryAt);
      case "quota_exhausted":
      case "breaker_open":
      case "disabled":
        throw new JobFetchError("blocked");
    }
  }

  private canWaitInChain(domain: string, retryAt: Date): boolean {
    const now = this.deps.now().getTime();
    const waitMs = retryAt.getTime() - now;
    return (
      waitMs <= fetchDomainPolicy(domain).minIntervalMs &&
      retryAt.getTime() - this.startedAt <= JOB_FETCH_CEILING_MS
    );
  }
}

/** HTTP statuses that are a refusal by the site (ADR-0008 §4), mapped to the breaker's signal. */
const STOP_STATUSES: Readonly<Record<number, FetchStopSignal>> = {
  429: "http_429",
  999: "http_999",
  403: "http_403",
};

/**
 * Maps a failure of `SafeHttpClient.get` to the job's outcome. Stop statuses trip the breaker of the domain that
 * answered; network errors and 5xx (not 999) are `transient` (one retry after 60 s); anything else is
 * `permanent` (paste-text). Policy errors pass through unchanged.
 */
export async function classifyFetchFailure(error: unknown, hops: JobFetchHops): Promise<never> {
  if (error instanceof JobFetchError || error instanceof JobFetchDeferredError) throw error;
  if (!(error instanceof SafeHttpError)) throw new JobFetchError("transient");
  if (error.code === "http_status" && error.status !== null) {
    const signal = STOP_STATUSES[error.status];
    if (signal !== undefined && hops.domain !== null) return hops.stop(hops.domain, signal);
    throw new JobFetchError(error.status >= 500 ? "transient" : "permanent");
  }
  switch (error.code) {
    case "timeout":
    case "network":
    case "aborted":
      throw new JobFetchError("transient");
    default:
      throw new JobFetchError("permanent");
  }
}
