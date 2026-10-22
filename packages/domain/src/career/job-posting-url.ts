import { createHash } from "node:crypto";
import { isTrackingParameter } from "../sources/canonical-url.js";
import { JOB_FETCH_LINKEDIN_DOMAIN, jobFetchGroupId } from "./fetch-domain.js";

/**
 * Tracking parameters of job boards, on top of the generic ones of `canonical-url.ts`: LinkedIn (`trk`,
 * `refId`, `trackingId`, `lipi`, `eBP` …), Gupy (`jobBoardSource`), Greenhouse (`gh_src`), Lever
 * (`lever-source`, `lever-origin`) and plain referrer markers. Compared in lower case.
 */
const JOB_TRACKING_PARAMETERS = new Set([
  "trk",
  "trkinfo",
  "refid",
  "trackingid",
  "lipi",
  "ebp",
  "recommendedflavor",
  "originalsubdomain",
  "midtoken",
  "midsig",
  "jobboardsource",
  "gh_src",
  "lever-source",
  "lever-origin",
  "ref",
  "referer",
  "referrer",
  "source",
  "src",
]);

/** `/jobs/view/<id>` and its slug form `/jobs/view/<title>-at-<company>-<id>`. */
const LINKEDIN_JOB_VIEW = /^\/jobs\/view\/(?:[^/]*-)?(\d{1,20})\/?$/;
/** Search, collections and recommendations pages carry the posting in `currentJobId`. */
const LINKEDIN_JOB_ID = /^\d{1,20}$/;

/**
 * Normalized link of a job posting: the identity used to merge duplicates of a batch (`url_hash`) and the
 * URL `job.fetch` reads. Scheme and host lowercased, default port, fragment, credentials-free (the contract
 * already rejects credentials) and tracking parameters dropped; the remaining parameters sorted.
 *
 * A LinkedIn job link becomes `https://www.linkedin.com/jobs/view/<id>/`, the only path `job.fetch` accepts
 * (ADR-0008 §4): the slug form and the `currentJobId` of a search page map to it, every query parameter is
 * dropped. Any other LinkedIn link keeps its path without query (the fetcher fails it as `permanent`, with the
 * option of pasting the text). Shorteners (`lnkd.in`) keep their path: it is what identifies the posting.
 *
 * Throws `TypeError` on an invalid URL; callers validate with Zod first.
 */
export function normalizeJobPostingUrl(raw: string): string {
  const url = new URL(raw.trim());
  url.username = "";
  url.password = "";
  url.hash = "";
  url.hostname = url.hostname.toLowerCase().replace(/\.+$/, "");
  if (
    (url.protocol === "https:" && url.port === "443") ||
    (url.protocol === "http:" && url.port === "80")
  ) {
    url.port = "";
  }

  if (isLinkedInHost(url.hostname)) {
    const viewed = LINKEDIN_JOB_VIEW.exec(url.pathname)?.[1];
    const current = url.searchParams.get("currentJobId");
    const jobId = viewed ?? (current !== null && LINKEDIN_JOB_ID.test(current) ? current : null);
    if (jobId !== null) return `https://www.linkedin.com/jobs/view/${jobId}/`;
    url.search = "";
    return url.toString();
  }

  const kept = [...url.searchParams.entries()].filter(
    ([name]) => !isTrackingParameter(name) && !JOB_TRACKING_PARAMETERS.has(name.toLowerCase()),
  );
  kept.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  url.search = "";
  for (const [name, value] of kept) url.searchParams.append(name, value);
  return url.toString();
}

/** sha256 (hex) of the normalized link: `job_postings.url_hash`. */
export function jobPostingUrlHash(normalizedUrl: string): string {
  return createHash("sha256").update(normalizedUrl, "utf8").digest("hex");
}

/** Hosts of `linkedin.com` itself (not shorteners, which are only rate-limited as LinkedIn). */
function isLinkedInHost(host: string): boolean {
  return host === JOB_FETCH_LINKEDIN_DOMAIN || host.endsWith(`.${JOB_FETCH_LINKEDIN_DOMAIN}`);
}

/** Source kind of a fetched link: LinkedIn when its group (eTLD+1, `lnkd.in` included) is `linkedin.com`. */
export function jobPostingSourceOf(normalizedUrl: string): "LINKEDIN" | "OTHER" {
  return jobFetchGroupId(normalizedUrl) === JOB_FETCH_LINKEDIN_DOMAIN ? "LINKEDIN" : "OTHER";
}
