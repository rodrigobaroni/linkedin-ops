"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  LINKEDIN_CONNECTION_QUERY_KEY,
  PUBLICATIONS_QUERY_KEY,
  createLinkedInApi,
  createPublicationsApi,
} from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";

/** LinkedIn + publications clients over the session-aware API client (cookie, CSRF, N4 headers). */
export function usePublishingApi() {
  const { client } = useAuth();
  return useMemo(
    () => ({ linkedin: createLinkedInApi(client), publications: createPublicationsApi(client) }),
    [client],
  );
}

export function useLinkedInConnection() {
  const { linkedin } = usePublishingApi();
  return useQuery({
    queryKey: LINKEDIN_CONNECTION_QUERY_KEY,
    queryFn: ({ signal }) => linkedin.get(signal),
    staleTime: 30_000,
  });
}

export function useRecentPublications() {
  const { publications } = usePublishingApi();
  return useQuery({
    queryKey: PUBLICATIONS_QUERY_KEY,
    queryFn: ({ signal }) => publications.listRecent(signal),
  });
}

/** `dd/mm/aaaa hh:mm` in the user's timezone (explicit, never the server's). */
export function formatDateTime(iso: string, timeZone: string | undefined): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone,
  }).format(new Date(iso));
}

/** Only LinkedIn's own authorization page may receive the browser (defence against a bad API answer). */
export function isLinkedInAuthorizeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "www.linkedin.com" || url.hostname === "linkedin.com")
    );
  } catch {
    return false;
  }
}
