import type { PrismaClient } from "../client.js";
import {
  decideFetchSlot,
  fetchDomainOfHost,
  killSwitchSlot,
  tripFetchBreaker,
  type FetchDomainGuardOptions,
  type FetchDomainState,
} from "./fetch-domain.js";
import type { FetchDomainGuard, FetchSlot, FetchStopSignal } from "./ports.js";

type Transaction = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

interface StateRow {
  last_request_at: Date | null;
  recent_requests: Date[];
  breaker_open_until: Date | null;
  breaker_signal: FetchStopSignal | null;
  breaker_opened_at: Date | null;
}

/**
 * `FetchDomainGuard` over `job_fetch_domain_state`, shared by every worker process and surviving restarts.
 * Each call is one transaction that locks the domain's row (`INSERT … ON CONFLICT DO NOTHING`, then
 * `SELECT … FOR UPDATE`), so concurrent hops to the same domain are decided one after the other and can never
 * both pass the interval or the quota. The application clock is bound as a parameter, never SQL `now()`.
 */
export class PrismaFetchDomainGuard implements FetchDomainGuard {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly now: () => Date,
    private readonly options: FetchDomainGuardOptions,
  ) {}

  async acquire(domain: string): Promise<FetchSlot> {
    const key = fetchDomainOfHost(domain);
    // The kill switch needs no state: a disabled domain is never written.
    const disabled = killSwitchSlot(key, this.options.linkedInFetch);
    if (disabled) return disabled;
    return this.prisma.$transaction(async (tx) => {
      const current = await lockState(tx, key, this.now());
      // Read after the lock: time spent waiting for a concurrent hop never backdates this request.
      const now = this.now();
      const { slot, state } = decideFetchSlot(key, current, now, this.options.linkedInFetch);
      if (state) await saveState(tx, key, state, now);
      return slot;
    });
  }

  async tripBreaker(domain: string, signal: FetchStopSignal): Promise<{ openUntil: Date }> {
    const key = fetchDomainOfHost(domain);
    return this.prisma.$transaction(async (tx) => {
      const current = await lockState(tx, key, this.now());
      const now = this.now();
      const state = tripFetchBreaker(current, signal, now);
      await saveState(tx, key, state, now);
      return { openUntil: state.breakerOpenUntil as Date };
    });
  }
}

async function lockState(tx: Transaction, domain: string, now: Date): Promise<FetchDomainState> {
  await tx.$executeRaw`
    INSERT INTO "job_fetch_domain_state" ("domain", "recent_requests", "updated_at")
    VALUES (${domain}, ARRAY[]::timestamptz(3)[], ${now})
    ON CONFLICT ("domain") DO NOTHING`;
  const [row] = await tx.$queryRaw<StateRow[]>`
    SELECT "last_request_at", "recent_requests", "breaker_open_until", "breaker_signal", "breaker_opened_at"
    FROM "job_fetch_domain_state" WHERE "domain" = ${domain} FOR UPDATE`;
  if (!row) throw new Error("job_fetch_domain_state row vanished inside its own transaction");
  return {
    lastRequestAt: row.last_request_at,
    recentRequests: row.recent_requests,
    breakerOpenUntil: row.breaker_open_until,
    breakerSignal: row.breaker_signal,
    breakerOpenedAt: row.breaker_opened_at,
  };
}

async function saveState(
  tx: Transaction,
  domain: string,
  state: FetchDomainState,
  now: Date,
): Promise<void> {
  await tx.jobFetchDomainState.update({
    where: { domain },
    data: {
      lastRequestAt: state.lastRequestAt,
      recentRequests: state.recentRequests,
      breakerOpenUntil: state.breakerOpenUntil,
      breakerSignal: state.breakerSignal,
      breakerOpenedAt: state.breakerOpenedAt,
      updatedAt: now,
    },
  });
}
