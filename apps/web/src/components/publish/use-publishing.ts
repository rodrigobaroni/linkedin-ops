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

const LINKEDIN_ORIGIN = "https://www.linkedin.com";
const LINKEDIN_AUTHORIZE_PATH = "/oauth/v2/authorization";

/**
 * Only LinkedIn's own OAuth authorization endpoint may receive the browser (defence against a bad API
 * answer): exact origin (https, `www.linkedin.com`, default port), exact path, no userinfo.
 */
export function isLinkedInAuthorizeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.origin === LINKEDIN_ORIGIN &&
      url.pathname === LINKEDIN_AUTHORIZE_PATH &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
}
