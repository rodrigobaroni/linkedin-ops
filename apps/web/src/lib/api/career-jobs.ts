import {
  JOB_POSTING_LIMITS,
  type JobPostingAccepted,
  type JobPostingDetail,
  type JobPostingSummary,
  JobPostingUrlSchema,
  type Page,
  type TailoringBatchAccepted,
  routesV1,
} from "@linkedin-ops/contracts";
import type { ApiClient, BinaryBody } from "./http";

export type {
  JobPostingAccepted,
  JobPostingDetail,
  JobPostingFailure,
  JobPostingSourceKind,
  JobPostingStatus,
  JobPostingSummary,
  JobPostingTailoring,
  TailoringBatchAccepted,
} from "@linkedin-ops/contracts";
export { JOB_POSTING_LIMITS };

const routes = {
  createBatch: routesV1["career.batches.create"],
  list: routesV1["career.jobs.list"],
  get: routesV1["career.jobs.get"],
  pasteText: routesV1["career.jobs.pasteText"],
  retry: routesV1["career.jobs.retry"],
  remove: routesV1["career.jobs.delete"],
  pdf: routesV1["career.jobs.pdf"],
};

/** Name used when the API sends no usable `Content-Disposition` file name. */
export const TAILORED_CV_FALLBACK_FILENAME = "CV-adaptado.pdf";

/**
 * Hands a downloaded file to the browser: an object URL clicked through a temporary `<a download>`, revoked
 * right after. Nothing is stored; the PDF holds personal data.
 */
export function saveFile(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    // Some browsers read the URL after the click returns: revoke on the next task.
    setTimeout(() => URL.revokeObjectURL(href), 0);
  }
}

export const CAREER_JOBS_QUERY_KEY = ["career", "jobs"] as const;

export function careerJobQueryKey(id: string) {
  return [...CAREER_JOBS_QUERY_KEY, "detail", id] as const;
}

/** Polling while a posting is `FETCHING`/`ANALYZING`: 3 s, growing ×1.5 per poll up to 15 s. */
export const JOBS_POLL = { initialMs: 3_000, factor: 1.5, maxMs: 15_000 } as const;

/** Delay before poll number `attempt` (0-based) since some posting started processing. */
export function jobsPollDelayMs(attempt: number, initialMs: number = JOBS_POLL.initialMs): number {
  return Math.min(initialMs * JOBS_POLL.factor ** attempt, JOBS_POLL.maxMs);
}

export function isProcessing(posting: Pick<JobPostingSummary, "status">): boolean {
  return posting.status === "FETCHING" || posting.status === "ANALYZING";
}

/** Host of a normalized posting link, shown while there is no title. Never rendered as a link. */
export function jobDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export type ParsedJobLinks = {
  /** Non-empty lines, trimmed, in order. */
  urls: string[];
  /** 1-based line numbers (among the non-empty lines) the contract refuses. */
  invalidLines: number[];
};

/**
 * One link per line (Aurora §3). Blank lines are ignored; each line is checked with the contract's
 * `JobPostingUrlSchema`, the same rule the API applies. Duplicates are left to the server, which merges them
 * by normalized URL and reports how many.
 */
export function parseJobLinks(text: string): ParsedJobLinks {
  const urls = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const invalidLines = urls.flatMap((url, index) =>
    JobPostingUrlSchema.safeParse(url).success ? [] : [index + 1],
  );
  return { urls, invalidLines };
}

export function createCareerJobsApi(client: ApiClient) {
  return {
    /** `POST /career/batches` (202): one `job.fetch` per distinct link, against the active CV base. */
    createBatch: (urls: string[]): Promise<TailoringBatchAccepted> =>
      client.request(routes.createBatch, { body: { urls } }),
    /** `GET /career/jobs`: newest first, cursor = id of the last posting of the previous page. */
    list: (cursor: string | undefined, signal?: AbortSignal): Promise<Page<JobPostingSummary>> =>
      client.request(routes.list, { query: { cursor }, signal }),
    /** `GET /career/jobs/{id}`: extracted requirements, match report and tailored CV. */
    get: (id: string, signal?: AbortSignal): Promise<JobPostingDetail> =>
      client.request(routes.get, { params: { id }, signal }),
    /** `POST /career/jobs/{id}/text` (202): pasted posting text, then reprocessing. */
    pasteText: (id: string, text: string): Promise<JobPostingAccepted> =>
      client.request(routes.pasteText, { params: { id }, body: { text } }),
    /** `POST /career/jobs/{id}/retry` (202): from the furthest step the stored data allows. */
    retry: (id: string): Promise<JobPostingAccepted> =>
      client.request(routes.retry, { params: { id } }),
    /** `DELETE /career/jobs/{id}`: the posting and its tailored CV. */
    remove: (id: string): Promise<void> => client.request(routes.remove, { params: { id } }),
    /** `GET /career/jobs/{id}/pdf`: the tailored CV as a PDF (READY only), without provenance marks. */
    pdf: (id: string): Promise<BinaryBody> => client.request(routes.pdf, { params: { id } }),
  };
}
export type CareerJobsApi = ReturnType<typeof createCareerJobsApi>;
