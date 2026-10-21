"use client";

import { Alert, AlertDescription, Badge, type BadgeProps, Skeleton } from "@linkedin-ops/ui";
import type { PublicationStatus } from "@linkedin-ops/contracts";
import { useId } from "react";
import { messages } from "@/i18n/pt-br";
import { publicationUrl } from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";
import { formatDateTime, useRecentPublications } from "./use-publishing";

const copy = messages.publish.recent;
const EXCERPT_LENGTH = 160;

const STATUS_VARIANT: Record<PublicationStatus, BadgeProps["variant"]> = {
  PENDING: "secondary",
  IN_PROGRESS: "info",
  SUCCEEDED: "success",
  FAILED: "destructive",
  AMBIGUOUS: "warning",
};

/** Simple list of the latest publications (first page of `GET /publications`). Text is plain, escaped. */
export function RecentPublications() {
  const titleId = useId();
  const { user } = useAuth();
  const query = useRecentPublications();

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <h2 id={titleId} className="text-lg font-semibold leading-7">
        {copy.title}
      </h2>
      {query.isPending ? (
        <div className="flex flex-col gap-2" aria-hidden="true">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : query.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{copy.loadError}</AlertDescription>
        </Alert>
      ) : query.data.items.length === 0 ? (
        <p className="text-sm leading-6 text-muted-foreground">{copy.empty}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-md border bg-card">
          {query.data.items.map((publication) => {
            const url = publicationUrl(publication);
            const when = publication.publishedAt ?? publication.createdAt;
            return (
              <li key={publication.id} className="flex flex-col gap-1.5 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2 text-sm leading-5">
                  <Badge variant={STATUS_VARIANT[publication.status]}>
                    {copy.status[publication.status]}
                  </Badge>
                  <time dateTime={when} className="text-muted-foreground">
                    {formatDateTime(when, user?.timezone)}
                  </time>
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium underline"
                    >
                      {copy.viewPost}
                      <span className="sr-only"> {messages.publish.result.opensInNewTab}</span>
                    </a>
                  ) : null}
                </div>
                <p className="whitespace-pre-wrap break-words text-sm leading-6">
                  {excerpt(publication.text) ?? (
                    <span className="text-muted-foreground">{copy.noText}</span>
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function excerpt(text: string | null): string | null {
  if (!text) return null;
  const chars = [...text.trim()];
  return chars.length > EXCERPT_LENGTH
    ? `${chars.slice(0, EXCERPT_LENGTH).join("")}…`
    : chars.join("");
}
