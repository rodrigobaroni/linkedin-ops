/**
 * Anonymous job-page fetcher (ADR-0008): one GET of the URL Rodrigo supplied, through `SafeHttpClient`, with the
 * per-hop policy of `JobFetchHops`, reduced to the posting's main text. It receives only the HTTP client and the
 * `FetchDomainGuard`: no LinkedIn API adapter, token vault, session or environment (architecture test).
 */
import type { FetchDomainGuard } from "@linkedin-ops/domain";
import type { Logger } from "pino";
import {
  SafeHttpClient,
  SafeHttpError,
  type SafeHttpClientOptions,
} from "../http/safe-http-client.js";
import { JobFetchHops, classifyFetchFailure, isLinkedInShortener } from "./job-fetch-policy.js";
import { extractJobPageTextIsolated } from "./job-page-text-runner.js";
import { JobFetchError, type JobPageFetcher } from "./ports.js";

/** Bumped when the fetcher's behavior towards sites changes. */
export const JOB_FETCHER_VERSION = "1.0.0";
/** Honest, fixed identification (ADR-0008 §3): never rotated, never a browser's. */
export const JOB_FETCHER_USER_AGENT = `LinkedInOpsJobFetcher/${JOB_FETCHER_VERSION} (self-hosted; single user)`;

export interface HttpJobPageFetcherDeps {
  guard: FetchDomainGuard;
  http?: Pick<SafeHttpClient, "get">;
  /** Passed to the default `SafeHttpClient` (e.g. `extraBlockedCidrs` through its address policy). */
  httpOptions?: Omit<SafeHttpClientOptions, "userAgent">;
  now?: () => Date;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

export class HttpJobPageFetcher implements JobPageFetcher {
  private readonly http: Pick<SafeHttpClient, "get">;
  private readonly now: () => Date;

  constructor(private readonly deps: HttpJobPageFetcherDeps) {
    this.http =
      deps.http ?? new SafeHttpClient({ ...deps.httpOptions, userAgent: JOB_FETCHER_USER_AGENT });
    this.now = deps.now ?? (() => new Date());
  }

  async fetchJobText(
    url: string,
    signal: AbortSignal,
    logger?: Pick<Logger, "info" | "warn">,
  ): Promise<{ text: string }> {
    const started = this.now().getTime();
    const hops = new JobFetchHops(
      {
        guard: this.deps.guard,
        now: this.now,
        sleep: this.deps.sleep,
        onEvent: (event) => logger?.info({ fetchHop: event }, "job fetch hop"),
      },
      signal,
    );
    let response;
    try {
      response = await this.http.get(url, { signal, beforeHop: hops.beforeHop });
    } catch (error) {
      // Classes and codes only: never the URL, a header or the response.
      logger?.info(
        {
          fetchDomain: hops.domain,
          errorClass: error instanceof Error ? error.name : "unknown",
          errorCode: error instanceof SafeHttpError ? error.code : undefined,
          httpStatus: error instanceof SafeHttpError ? error.status : undefined,
          fetchKind: error instanceof JobFetchError ? error.kind : undefined,
          durationMs: this.now().getTime() - started,
        },
        "job page request failed",
      );
      return classifyFetchFailure(error, hops);
    }

    const domain = hops.domain as string;
    // A shortener that answers 200 shows an interstitial, not the posting.
    if (isLinkedInShortener(response.url)) throw new JobFetchError("permanent");
    // Off the event loop, with a hard timeout (QA #104).
    const page = await extractJobPageTextIsolated(response.body, response.contentType);
    logger?.info(
      {
        fetchDomain: domain,
        httpStatusClass: `${Math.floor(response.status / 100)}xx`,
        page: page.kind,
        chars: page.kind === "text" ? page.text.length : 0,
        durationMs: this.now().getTime() - started,
      },
      "job page fetched",
    );
    if (page.kind === "login_wall") return hops.stop(domain, "login_wall");
    // Unreadable markup is never retried: a new fetch would spend quota on the same page.
    if (page.kind === "empty" || page.kind === "unreadable") throw new JobFetchError("permanent");
    return { text: page.text };
  }
}
