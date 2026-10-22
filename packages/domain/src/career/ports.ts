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
