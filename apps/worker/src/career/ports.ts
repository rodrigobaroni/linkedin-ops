/**
 * Ports the Career handlers depend on. PR 1 ships the handlers as plumbing over these ports; Alicerce binds
 * them to the domain repositories in PR 2 (`CvBaseDraftStore`) and PR 3 (`JobPostingStore`), and Pêndulo adds
 * the `JobPageFetcher` (SafeHttpClient, ADR-0008) in PR 3.
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

export interface CvBaseDraftStore {
  /** Draft in status `extracting` with the PDF text (the PDF itself was discarded by the API). */
  loadForExtraction(cvBaseId: string): Promise<{ text: string } | null>;
  completeExtraction(
    cvBaseId: string,
    result: {
      cv: CvStructured;
      parseWarnings: ParseWarning[];
      injectionSuspected: boolean;
      injectionEvidence: string | null;
      generation: GenerationInfo;
    },
  ): Promise<void>;
  markFailed(cvBaseId: string, reason: CareerFailureReason): Promise<void>;
}

export type JobPostingSource = { kind: "pasted"; text: string } | { kind: "url"; url: string };

export interface JobPostingStore {
  /** Posting in status `fetching` (buscando). */
  loadForFetch(jobPostingId: string): Promise<{ source: JobPostingSource } | null>;
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

/** Anonymous job-page fetcher (PR 3, ADR-0008). Throws `JobFetchError`. */
export interface JobPageFetcher {
  fetchJobText(url: string, signal: AbortSignal): Promise<{ text: string }>;
}

export class JobFetchError extends Error {
  /** `blocked` = stop signal (429/999/403/login wall): never retried. `transient` = network/5xx. */
  readonly kind: "blocked" | "transient" | "permanent";

  constructor(kind: "blocked" | "transient" | "permanent") {
    super(`Job page fetch failed: ${kind}`);
    this.name = "JobFetchError";
    this.kind = kind;
  }
}

/** Default until PR 3: URL postings fail to paste-text (`fetch`) without touching the network. */
export const unavailableJobPageFetcher: JobPageFetcher = {
  fetchJobText: () => Promise.reject(new JobFetchError("permanent")),
};
