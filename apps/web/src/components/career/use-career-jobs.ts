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
 * 15 s, counted from the first read where processing was seen (`since` holds that `dataUpdateCount`); nothing
 * once everything settled. Hidden tab: no reads (`refetchIntervalInBackground: false`); visible again: one
 * immediate refetch. The pipeline lives on the server, so leaving and coming back polls from the current state.
 */
function pollDelay(
  processing: boolean,
  dataUpdateCount: number,
  since: RefObject<number | null>,
  initialMs: number,
): number | false {
  if (!processing) {
    since.current = null;
    return false;
  }
  since.current ??= dataUpdateCount;
  return jobsPollDelayMs(dataUpdateCount - since.current, initialMs);
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
      pollDelay(
        anyProcessing(query.state.data?.pages),
        query.state.dataUpdateCount,
        since,
        pollInitialMs,
      ),
    refetchIntervalInBackground: false,
    // "always": the app-wide 30 s staleTime would otherwise keep the polled data "fresh" on return.
    refetchOnWindowFocus: (query) => (anyProcessing(query.state.data?.pages) ? "always" : false),
  });
}

/** `GET /career/jobs/{id}`, polled while the posting is processing; a `404` is final (no retries). */
export function useCareerJob(id: string, pollInitialMs: number = JOBS_POLL.initialMs) {
  const api = useCareerJobsApi();
  const since = useRef<number | null>(null);
  return useQuery({
    queryKey: careerJobQueryKey(id),
    queryFn: ({ signal }) => api.get(id, signal),
    retry: (count, error) => !isApiProblem(error, "NOT_FOUND") && count < 2,
    refetchInterval: (query) =>
      pollDelay(
        query.state.data ? isProcessing(query.state.data) : false,
        query.state.dataUpdateCount,
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
