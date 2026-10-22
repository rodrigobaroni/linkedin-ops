"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef } from "react";
import { CAREER_CV_QUERY_KEY, CV_POLL, createCareerCvApi, cvPollDelayMs } from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";

/**
 * `/career/cv` client over the session-aware API client. The CV is personal data: it lives only in the
 * query cache (memory), which logout clears; nothing of it goes to storage, the URL or the console.
 */
export function useCareerCvApi() {
  const { client } = useAuth();
  return useMemo(() => createCareerCvApi(client), [client]);
}

/**
 * `GET /career/cv`, polled while the draft is `EXTRACTING` (the worker reads the PDF): 2 s, then backing off
 * to 10 s. Hidden tab: no reads at all; visible again: one immediate refetch (the app-wide default turns
 * refetch-on-focus off, so it is forced here only while extracting), then the interval goes on. The
 * extraction lives on the server, so leaving the screen and coming back polls again from the current state.
 */
export function useCareerCv(pollInitialMs: number = CV_POLL.initialMs) {
  const api = useCareerCvApi();
  /** Draft being polled and the `dataUpdateCount` when polling it started (counts polls, not renders). */
  const polling = useRef<{ draftId: string; since: number } | null>(null);
  return useQuery({
    queryKey: CAREER_CV_QUERY_KEY,
    queryFn: ({ signal }) => api.get(signal),
    refetchInterval: (query) => {
      const draft = query.state.data?.draft;
      if (draft?.status !== "EXTRACTING") {
        polling.current = null;
        return false;
      }
      if (polling.current?.draftId !== draft.id) {
        polling.current = { draftId: draft.id, since: query.state.dataUpdateCount };
      }
      return cvPollDelayMs(query.state.dataUpdateCount - polling.current.since, pollInitialMs);
    },
    refetchIntervalInBackground: false,
    // "always": the app-wide 30 s staleTime would otherwise keep the polled data "fresh" on return.
    refetchOnWindowFocus: (query) =>
      query.state.data?.draft?.status === "EXTRACTING" ? "always" : false,
  });
}
