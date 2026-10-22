/**
 * Ports the Career job handlers depend on (worker, ADR-0002). The domain owns them, as it owns
 * `SessionService`: `PrismaCvBaseDraftStore` implements `CvBaseDraftStore`; `JobPostingStore` is bound in
 * career PR 3.
 *
 * Every `load*` returns `null` when the item is gone or no longer in the state that step expects, so a
 * duplicated or late job exits quietly (ADR-0002 §8). Implementations of `complete*` change state and, where a
 * next step exists, enqueue it in the same transaction (ADR-0002 §3).
 */
import type {
  CvStructured,
  JobPostingExtracted,
  MatchReport,
  ParseWarning,
  TailoredCvContent,
} from "@linkedin-ops/contracts";

/** Failure reasons shown to Rodrigo (spec §9); `fetch_blocked` per ADR-0008 §4. */
export type CareerFailureReason = "fetch" | "fetch_blocked" | "not_a_job" | "not_a_cv" | "ai";

/** What produced a result (ADR-0005 §3: persisted for reproducibility). */
export interface GenerationInfo {
  model: string;
  promptVersions: Record<string, string>;
  engineVersion: string;
}

/** The job acting on the item, for the audit trail (actor `WORKER`). */
export interface CareerJobMeta {
  jobId: string;
  correlationId: string;
}

/** Result of `cv-extract`; the injection flags are shown to the owner before confirming (ADR-0005 §4). */
export interface CvExtractionResult {
  cv: CvStructured;
  parseWarnings: ParseWarning[];
  injectionSuspected: boolean;
  injectionEvidence: string | null;
  generation: GenerationInfo;
}

export interface CvBaseDraftStore {
  /** Draft in status `extracting` with the PDF text (the PDF itself was discarded by the API). */
  loadForExtraction(cvBaseId: string): Promise<{ text: string } | null>;
  /** The draft becomes `READY` and its PDF text is erased; a no-op once it left `extracting`. */
  completeExtraction(
    cvBaseId: string,
    result: CvExtractionResult,
    meta: CareerJobMeta,
  ): Promise<void>;
  /** The draft becomes `FAILED` and its PDF text is erased; a no-op once it left `extracting`. */
  markFailed(cvBaseId: string, reason: CareerFailureReason, meta: CareerJobMeta): Promise<void>;
}

export type JobPostingSource = { kind: "pasted"; text: string } | { kind: "url"; url: string };

export interface JobPostingStore {
  /**
   * Posting in status `fetching` (buscando). `fetchedText` is the page text saved by an earlier attempt
   * (`saveFetchedText`); when present the handler never fetches again (ADR-0008 §4: retries only for
   * network/5xx, never because the AI step failed).
   */
  loadForFetch(
    jobPostingId: string,
  ): Promise<{ source: JobPostingSource; fetchedText: string | null } | null>;
  /** Persists the fetched page text (already sanitized and truncated) before any model call. */
  saveFetchedText(jobPostingId: string, text: string): Promise<void>;
  /** Stores the extraction and enqueues `cv.tailor` atomically. `rawText` is truncated by the store. */
  completeExtraction(
    jobPostingId: string,
    result: {
      job: JobPostingExtracted;
      rawText: string;
      droppedRequirementCount: number;
      injectionSuspected: boolean;
      injectionEvidence: string | null;
      generation: GenerationInfo;
    },
  ): Promise<void>;
  /** Posting in status `analyzing` with the active base CV it is tailored against. */
  loadForTailoring(jobPostingId: string): Promise<{
    cvBaseId: string;
    base: CvStructured;
    job: JobPostingExtracted;
    /** Posting text, for the checker's `job-echo` marker. */
    rawText: string;
    jobInjectionSuspected: boolean;
  } | null>;
  completeTailoring(
    jobPostingId: string,
    result: {
      cvBaseId: string;
      content: TailoredCvContent;
      report: MatchReport;
      generation: GenerationInfo;
    },
  ): Promise<void>;
  markFailed(jobPostingId: string, reason: CareerFailureReason): Promise<void>;
}

/**
 * Stop signals of ADR-0008 §4; each one opens the domain's breaker. `login_redirect` = a redirect to `/login`,
 * `/authwall`, `/checkpoint` or `/uas/`; `login_wall` = a page recognized as a login wall or CAPTCHA.
 */
export type FetchStopSignal =
  "http_429" | "http_999" | "http_403" | "login_redirect" | "login_wall";

/**
 * Outcome of `FetchDomainGuard.acquire`. What `job.fetch` does with each one (Maestro, 2026-10-22):
 * - `granted`: send the request now (it is already counted);
 * - `wait`: reschedule the job with `startAfter = retryAt`, never sleep holding a slot and never fail + retry
 *   (that would spend the network retry of ADR-0008 §4);
 * - `quota_exhausted`, `breaker_open`, `disabled`: fail closed with `fetch_blocked`, with no automatic retry
 *   and no hidden backlog. `retryAt`/`until` goes into the reason shown to Rodrigo ("tente de novo depois
 *   de…"), next to the paste-text option; `disabled` offers paste-text only.
 */
export type FetchSlot =
  | { outcome: "granted" }
  /** The minimum interval since the domain's last request has not passed yet. */
  | { outcome: "wait"; retryAt: Date }
  /** The rolling 24 h quota is used up; `retryAt` = oldest request in the window + 24 h. */
  | { outcome: "quota_exhausted"; retryAt: Date }
  | { outcome: "breaker_open"; until: Date; signal: FetchStopSignal }
  /** Kill switch `JOB_FETCH_LINKEDIN=disabled` and the domain is `linkedin.com`. */
  | { outcome: "disabled" };

/**
 * Per-domain limiter, circuit breaker and LinkedIn kill switch of `job.fetch` (ADR-0008 §4). It only keeps
 * and reads the state; the per-hop policy (which URL, which path, what a response means) belongs to the
 * fetcher. `domain` is `jobFetchGroupId(url)` of the hop's DESTINATION, on the first request and on every
 * redirect alike, so `lnkd.in` and third-party redirects stay under the rules of the site they land on. A bare
 * host is accepted too and normalized the same way.
 */
export interface FetchDomainGuard {
  /**
   * One call per hop, right before sending it. Atomically checks, in order, the kill switch, the breaker, the
   * rolling 24 h quota and the minimum interval; when all allow it, records the request and returns `granted`,
   * otherwise changes nothing. The request counts when reserved, not when answered: one that then fails on
   * the network still counts.
   */
  acquire(domain: string): Promise<FetchSlot>;
  /** A stop signal: opens the breaker for 24 h from now; an already later end wins. Idempotent. */
  tripBreaker(domain: string, signal: FetchStopSignal): Promise<{ openUntil: Date }>;
}
