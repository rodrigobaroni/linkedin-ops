import { getDomain } from "tldts";
import type { JobFetchLinkedInMode } from "../env/runtime.js";
import type { FetchDomainGuard, FetchSlot, FetchStopSignal } from "./ports.js";

/**
 * Per-domain fetch state of `job.fetch` (ADR-0008 §4): the `group` of the job, the limiter and the circuit
 * breaker are all keyed by the same normalized domain, so a hop can never be counted under a name that
 * escapes the rules of its destination.
 */
export const JOB_FETCH_LINKEDIN_DOMAIN = "linkedin.com";
/** `group.id` of a `job.fetch` for a pasted posting (no site is touched). Never collides with a domain. */
export const JOB_FETCH_PASTED_GROUP = "pasted";

/** Shorteners and other hosts operated by a site we rate-limit as that site (closed list, tested). */
const DOMAIN_ALIASES: Readonly<Record<string, string>> = {
  "lnkd.in": JOB_FETCH_LINKEDIN_DOMAIN,
};

/**
 * Registrable domain (eTLD+1, ICANN section of the Public Suffix List) of `url`'s host, lowercased, with
 * aliases applied (`lnkd.in` → `linkedin.com`). A host without a registrable domain (IP literal, `localhost`,
 * a bare public suffix) maps to itself. Throws `TypeError` on an invalid URL; callers validate with Zod first.
 *
 * eTLD+1 rather than the host because the limits protect the egress IP from the operator that would block it:
 * per host, `www.`, `br.` and the apex of `linkedin.com` (or `acme.gupy.io` and `other.gupy.io`) would get
 * separate budgets. The private section of the PSL is ignored on purpose, so `a.github.io` and `b.github.io`
 * share `github.io`: stricter, at the cost of at most one 5 s wait between them.
 */
export function jobFetchGroupId(url: string): string {
  return fetchDomainOfHost(new URL(url).hostname);
}

/** The same normalization for a bare host; idempotent, so a group id maps to itself. */
export function fetchDomainOfHost(host: string): string {
  const normalized = host.toLowerCase().replace(/\.+$/, "");
  const domain = getDomain(normalized, { allowPrivateDomains: false }) ?? normalized;
  return DOMAIN_ALIASES[domain] ?? domain;
}

export interface FetchDomainPolicy {
  /** Minimum time between two requests to the domain (`concurrency 1` comes from the queue group). */
  minIntervalMs: number;
  /** Requests allowed in any rolling 24 h; `null` = no quota. */
  maxPerRolling24h: number | null;
}

export const FETCH_QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000;
/** A stop signal opens the domain's breaker for 24 h (ADR-0008 §4). */
export const FETCH_BREAKER_OPEN_MS = 24 * 60 * 60 * 1000;

const LINKEDIN_POLICY: FetchDomainPolicy = { minIntervalMs: 15_000, maxPerRolling24h: 40 };
const DEFAULT_POLICY: FetchDomainPolicy = { minIntervalMs: 5_000, maxPerRolling24h: null };

/** ADR-0008 §4 defaults; Sentinela may tighten them, never loosen them, without a new review. */
export function fetchDomainPolicy(domain: string): FetchDomainPolicy {
  return domain === JOB_FETCH_LINKEDIN_DOMAIN ? LINKEDIN_POLICY : DEFAULT_POLICY;
}

/** Persisted state of one domain (`job_fetch_domain_state`). */
export interface FetchDomainState {
  lastRequestAt: Date | null;
  /** Granted requests inside the rolling 24 h window; kept only for domains with a quota. */
  recentRequests: Date[];
  breakerOpenUntil: Date | null;
  breakerSignal: FetchStopSignal | null;
  breakerOpenedAt: Date | null;
}

export const EMPTY_FETCH_DOMAIN_STATE: FetchDomainState = {
  lastRequestAt: null,
  recentRequests: [],
  breakerOpenUntil: null,
  breakerSignal: null,
  breakerOpenedAt: null,
};

/** `disabled` when the kill switch covers `domain`; `null` when it does not apply. Needs no state. */
export function killSwitchSlot(
  domain: string,
  linkedInFetch: JobFetchLinkedInMode,
): FetchSlot | null {
  return domain === JOB_FETCH_LINKEDIN_DOMAIN && linkedInFetch === "disabled"
    ? { outcome: "disabled" }
    : null;
}

/**
 * The guard's decision, shared by every implementation. Order: kill switch, breaker, quota, interval. `state`
 * is the new state to persist when the request is granted, `null` when nothing changes.
 */
export function decideFetchSlot(
  domain: string,
  current: FetchDomainState,
  now: Date,
  linkedInFetch: JobFetchLinkedInMode,
): { slot: FetchSlot; state: FetchDomainState | null } {
  const disabled = killSwitchSlot(domain, linkedInFetch);
  if (disabled) return { slot: disabled, state: null };

  const at = now.getTime();
  if (current.breakerOpenUntil !== null && current.breakerOpenUntil.getTime() > at) {
    return {
      slot: {
        outcome: "breaker_open",
        until: current.breakerOpenUntil,
        // A breaker is only ever opened with a signal; `login_wall` covers a hand-edited row.
        signal: current.breakerSignal ?? "login_wall",
      },
      state: null,
    };
  }

  const policy = fetchDomainPolicy(domain);
  const recent =
    policy.maxPerRolling24h === null
      ? []
      : current.recentRequests.filter((t) => t.getTime() + FETCH_QUOTA_WINDOW_MS > at);
  if (policy.maxPerRolling24h !== null && recent.length >= policy.maxPerRolling24h) {
    const oldest = Math.min(...recent.map((t) => t.getTime()));
    return {
      slot: { outcome: "quota_exhausted", retryAt: new Date(oldest + FETCH_QUOTA_WINDOW_MS) },
      state: null,
    };
  }

  // A `lastRequestAt` in the future (clock moved back) waits too: the error stays on the safe side.
  if (
    current.lastRequestAt !== null &&
    at - current.lastRequestAt.getTime() < policy.minIntervalMs
  ) {
    return {
      slot: {
        outcome: "wait",
        retryAt: new Date(current.lastRequestAt.getTime() + policy.minIntervalMs),
      },
      state: null,
    };
  }

  return {
    slot: { outcome: "granted" },
    state: {
      ...current,
      lastRequestAt: now,
      recentRequests: policy.maxPerRolling24h === null ? [] : [...recent, now],
    },
  };
}

/** Opens the breaker for 24 h from `now`; an already later end wins and keeps its signal. */
export function tripFetchBreaker(
  current: FetchDomainState,
  signal: FetchStopSignal,
  now: Date,
): FetchDomainState {
  const until = new Date(now.getTime() + FETCH_BREAKER_OPEN_MS);
  if (current.breakerOpenUntil !== null && current.breakerOpenUntil.getTime() >= until.getTime()) {
    return current;
  }
  return { ...current, breakerOpenUntil: until, breakerSignal: signal, breakerOpenedAt: now };
}

export interface FetchDomainGuardOptions {
  /** `JOB_FETCH_LINKEDIN` as validated at boot; required, so no caller gets a permissive default. */
  linkedInFetch: JobFetchLinkedInMode;
}

/**
 * Process-local `FetchDomainGuard` for unit tests of the worker. Production uses `PrismaFetchDomainGuard`, whose
 * state survives restarts and is shared by every worker process.
 */
export class InMemoryFetchDomainGuard implements FetchDomainGuard {
  private readonly states = new Map<string, FetchDomainState>();

  constructor(
    private readonly now: () => Date,
    private readonly options: FetchDomainGuardOptions,
  ) {}

  acquire(domain: string): Promise<FetchSlot> {
    const key = fetchDomainOfHost(domain);
    const { slot, state } = decideFetchSlot(
      key,
      this.stateOf(key),
      this.now(),
      this.options.linkedInFetch,
    );
    if (state) this.states.set(key, state);
    return Promise.resolve(slot);
  }

  tripBreaker(domain: string, signal: FetchStopSignal): Promise<{ openUntil: Date }> {
    const key = fetchDomainOfHost(domain);
    const state = tripFetchBreaker(this.stateOf(key), signal, this.now());
    this.states.set(key, state);
    return Promise.resolve({ openUntil: state.breakerOpenUntil as Date });
  }

  private stateOf(domain: string): FetchDomainState {
    return this.states.get(domain) ?? EMPTY_FETCH_DOMAIN_STATE;
  }
}
