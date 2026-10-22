/**
 * Worker-side port of the Career handlers: the anonymous job-page fetcher (Pêndulo, PR 3, ADR-0008). The
 * store ports (`CvBaseDraftStore`, `JobPostingStore`) live in `@linkedin-ops/domain`, next to their Prisma
 * implementations.
 */
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
