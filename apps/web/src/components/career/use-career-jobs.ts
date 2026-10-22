"use client";

import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { type RefObject, useMemo, useRef } from "react";
import {
  CAREER_JOBS_QUERY_KEY,
  JOBS_POLL,
  type JobPostingSummary,
  careerJobQueryKey,
  createCareerJobsApi,
  isApiProblem,
  isProcessing,
  jobsPollDelayMs,
} from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";

/**
 * `/career/jobs` client over the session-aware API client. Postings and tailored CVs are personal data: they
 * live only in the query cache (memory), which logout clears; nothing of them goes to storage, the URL or the
 * console.
 */
export function useCareerJobsApi() {
  const { client } = useAuth();
  return useMemo(() => createCareerJobsApi(client), [client]);
}

/**
 * Polling shared by the list and the detail: while something is `FETCHING`/`ANALYZING`, 3 s backing off to
 * 15 s, counted in reads (successful or failed) from the first one where processing was seen; nothing
 * once everything settled. Hidden tab: no reads (`refetchIntervalInBackground: false`); visible again: one
 * immediate refetch. The pipeline lives on the server, so leaving and coming back polls from the current state.
 */
export function pollDelay(
  processing: boolean,
  state: { dataUpdateCount: number; errorUpdateCount: number },
  since: RefObject<number | null>,
  initialMs: number,
): number | false {
  if (!processing) {
    since.current = null;
    return false;
  }
  // Failed reads count too: an API that keeps erroring is polled less and less often, never at 3 s.
  const reads = state.dataUpdateCount + state.errorUpdateCount;
  since.current ??= reads;
  return jobsPollDelayMs(reads - since.current, initialMs);
}

/** `GET /career/jobs`, newest first, by cursor ("Carregar mais"); every loaded page is polled together. */
export function useCareerJobs(pollInitialMs: number = JOBS_POLL.initialMs) {
  const api = useCareerJobsApi();
  const since = useRef<number | null>(null);
  const anyProcessing = (pages: { items: JobPostingSummary[] }[] | undefined) =>
    pages?.some((page) => page.items.some(isProcessing)) ?? false;
  return useInfiniteQuery({
    queryKey: CAREER_JOBS_QUERY_KEY,
    queryFn: ({ pageParam, signal }) => api.list(pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    refetchInterval: (query) =>
      pollDelay(anyProcessing(query.state.data?.pages), query.state, since, pollInitialMs),
    refetchIntervalInBackground: false,
    // "always": the app-wide 30 s staleTime would otherwise keep the polled data "fresh" on return.
    refetchOnWindowFocus: (query) => (anyProcessing(query.state.data?.pages) ? "always" : false),
  });
}

/**
 * No such posting: `404`, or `400 VALIDATION_FAILED` for an `{id}` that is not a UUID (a mistyped URL). Both
 * read as "Vaga não encontrada" and are never retried.
 */
export function isPostingMissing(error: unknown): boolean {
  return isApiProblem(error, "NOT_FOUND") || isApiProblem(error, "VALIDATION_FAILED");
}

/** `GET /career/jobs/{id}`, polled while the posting is processing; a missing posting is final (no retries). */
export function useCareerJob(id: string, pollInitialMs: number = JOBS_POLL.initialMs) {
  const api = useCareerJobsApi();
  const since = useRef<number | null>(null);
  return useQuery({
    queryKey: careerJobQueryKey(id),
    queryFn: ({ signal }) => api.get(id, signal),
    retry: (count, error) => !isPostingMissing(error) && count < 2,
    refetchInterval: (query) =>
      pollDelay(
        query.state.data ? isProcessing(query.state.data) : false,
        query.state,
        since,
        pollInitialMs,
      ),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: (query) =>
      query.state.data && isProcessing(query.state.data) ? "always" : false,
  });
}

/** After any change to a posting: the list and that posting's detail read again. */
export function useInvalidateJobs() {
  const queryClient = useQueryClient();
  return (id?: string) => {
    void queryClient.invalidateQueries({ queryKey: CAREER_JOBS_QUERY_KEY, exact: true });
    if (id) void queryClient.invalidateQueries({ queryKey: careerJobQueryKey(id) });
  };
}
