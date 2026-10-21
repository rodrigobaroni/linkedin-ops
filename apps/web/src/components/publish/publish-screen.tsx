"use client";

import { Alert, AlertDescription } from "@linkedin-ops/ui";
import { useQueryClient } from "@tanstack/react-query";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { messages } from "@/i18n/pt-br";
import { LINKEDIN_CONNECTION_QUERY_KEY } from "@/lib/api";
import { LinkedInConnectionCard } from "./linkedin-connection-card";
import { PublishComposer } from "./publish-composer";
import { RecentPublications } from "./recent-publications";

const copy = messages.publish;
/**
 * Set by the OAuth callback redirect: `?linkedin=connected` or `?linkedin=error&reason=<reason>`
 * (`GET /auth/linkedin/callback`, feat/T-061).
 */
export const LINKEDIN_CALLBACK_PARAM = "linkedin";
export const LINKEDIN_CALLBACK_REASON_PARAM = "reason";

type CallbackNotice = { kind: "success" | "info" | "error"; message: string };

/**
 * Turns the callback parameters into a notice. They come from the URL, so they are untrusted: only the
 * known reasons map to copy and nothing from the URL is echoed.
 */
export function callbackNotice(value: string | null, reason: string | null): CallbackNotice | null {
  if (value === null) return null;
  if (value === "connected") return { kind: "success", message: copy.callback.connected };
  if (reason === "denied") return { kind: "info", message: copy.callback.denied };
  const reasons: Record<string, string> = copy.callback.reasons;
  const message = reason !== null && Object.hasOwn(reasons, reason) ? reasons[reason] : undefined;
  return { kind: "error", message: message ?? copy.callback.failed };
}

export type PublishScreenProps = {
  /** Test seam for the OAuth redirect. */
  navigate?: (url: string) => void;
};

/** `/publicar` (MVP-0): LinkedIn connection, composer with preview, and the recent publications. */
export function PublishScreen({ navigate }: PublishScreenProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const callbackValue = searchParams.get(LINKEDIN_CALLBACK_PARAM);
  const callbackReason = searchParams.get(LINKEDIN_CALLBACK_REASON_PARAM);
  const [notice, setNotice] = useState<CallbackNotice | null>(() =>
    callbackNotice(callbackValue, callbackReason),
  );
  const callbackId = callbackValue === null ? null : `${callbackValue}:${callbackReason ?? ""}`;
  const [seenCallback, setSeenCallback] = useState(callbackId);
  // A new callback (adjusting state while rendering, not in an effect) replaces the notice.
  if (callbackId !== null && callbackId !== seenCallback) {
    setSeenCallback(callbackId);
    setNotice(callbackNotice(callbackValue, callbackReason));
  }

  useEffect(() => {
    if (callbackValue === null) return;
    void queryClient.invalidateQueries({ queryKey: LINKEDIN_CONNECTION_QUERY_KEY });
    // Drop the parameter so a reload or a shared link does not repeat the notice.
    const rest = new URLSearchParams(searchParams.toString());
    rest.delete(LINKEDIN_CALLBACK_PARAM);
    rest.delete(LINKEDIN_CALLBACK_REASON_PARAM);
    const search = rest.toString();
    router.replace((search ? `${pathname}?${search}` : pathname) as Route, { scroll: false });
  }, [callbackValue, pathname, router, searchParams, queryClient]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-8">
      <PageHeader title={copy.title} description={copy.description} />
      {notice ? (
        <Alert
          variant={notice.kind === "error" ? "destructive" : notice.kind}
          role={notice.kind === "error" ? "alert" : "status"}
        >
          <AlertDescription>{notice.message}</AlertDescription>
        </Alert>
      ) : null}
      <LinkedInConnectionCard navigate={navigate} />
      <PublishComposer />
      <RecentPublications />
    </div>
  );
}
