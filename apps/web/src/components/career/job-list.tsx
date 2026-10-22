"use client";

import { Button, Card, CardContent, ErrorState, LoadingState, Spinner } from "@linkedin-ops/ui";
import { useId, useState } from "react";
import { formatDateTime } from "@/components/publish/use-publishing";
import { messages } from "@/i18n/pt-br";
import { type JobPostingSummary, isApiProblem, jobDomain } from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";
import { type JobNotice, JobActions } from "./job-actions";
import { JobStatusBadge, failureReasonText, jobName } from "./job-status";
import { useCareerJobs } from "./use-career-jobs";

const copy = messages.career.jobs;

export type JobListProps = {
  onNotice: (notice: JobNotice) => void;
  /** Test seam: first polling interval while something is processing (3 s by default). */
  pollInitialMs?: number;
};

/**
 * "Suas vagas" (Aurora §3). One DOM tree for every width (Maestro, 3b): a list of items that stack as cards
 * on mobile and line up as table columns from `md` on, so reading and focus order are the same everywhere and
 * each item is read as one unit (`article` named by its heading). The column header row is visual only.
 * Status changes are announced once, consolidated, in a polite live region.
 */
export function JobList({ onNotice, pollInitialMs }: JobListProps) {
  const jobs = useCareerJobs(pollInitialMs);
  const { user } = useAuth();
  const titleId = useId();
  const items = jobs.data?.pages.flatMap((page) => page.items) ?? [];
  const announcement = useStatusAnnouncement(items);

  let body;
  if (jobs.isPending) {
    body = <LoadingState label={copy.loading} blocks={2} />;
  } else if (jobs.isError && !jobs.data) {
    body = (
      <ErrorState
        title={copy.loadError}
        correlationId={isApiProblem(jobs.error) ? jobs.error.correlationId : undefined}
        actions={
          <Button variant="outline" onClick={() => void jobs.refetch()}>
            {copy.retry}
          </Button>
        }
      />
    );
  } else if (items.length === 0) {
    body = <p className="text-sm leading-6 text-muted-foreground">{copy.list.empty}</p>;
  } else {
    body = (
      <Card className="gap-0 py-0">
        <CardContent className="px-0">
          <div
            aria-hidden="true"
            className="hidden border-b px-4 py-2 text-xs font-medium leading-4 text-muted-foreground md:grid md:grid-cols-[minmax(0,1fr)_11rem_9rem_minmax(9rem,auto)] md:gap-4"
          >
            <span>{copy.list.columns.job}</span>
            <span>{copy.list.columns.status}</span>
            <span>{copy.list.columns.updated}</span>
            <span className="text-right">{copy.list.columns.actions}</span>
          </div>
          <ul aria-labelledby={titleId} className="divide-y">
            {items.map((posting) => (
              <li key={posting.id}>
                <JobItem posting={posting} timeZone={user?.timezone} onNotice={onNotice} />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    );
  }

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <h2 id={titleId} className="text-lg font-semibold leading-7">
        {copy.list.title}
      </h2>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {body}
      {jobs.hasNextPage ? (
        <div>
          <Button
            variant="outline"
            className="max-sm:w-full max-md:h-11"
            disabled={jobs.isFetchingNextPage}
            onClick={() => void jobs.fetchNextPage()}
          >
            {jobs.isFetchingNextPage ? <Spinner /> : null}
            {jobs.isFetchingNextPage ? copy.list.loadingMore : copy.list.loadMore}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function JobItem({
  posting,
  timeZone,
  onNotice,
}: {
  posting: JobPostingSummary;
  timeZone: string | undefined;
  onNotice: (notice: JobNotice) => void;
}) {
  const headingId = useId();
  const updated = formatDateTime(posting.updatedAt, timeZone);
  const meta = [
    posting.company,
    posting.title ? jobDomain(posting.url) : null,
    copy.source[posting.source],
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <article
      aria-labelledby={headingId}
      className="flex flex-col gap-3 px-4 py-4 md:grid md:grid-cols-[minmax(0,1fr)_11rem_9rem_minmax(9rem,auto)] md:items-start md:gap-4"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h3 id={headingId} className="text-base font-semibold leading-6 break-words">
          {jobName(posting)}
        </h3>
        <p className="text-sm leading-5 text-muted-foreground break-words">{meta}</p>
        {posting.status === "READY" && posting.baseScore !== null ? (
          <p className="text-sm leading-5">{copy.list.score(posting.baseScore)}</p>
        ) : null}
        {posting.status === "FAILED" ? (
          <div className="text-sm leading-5">
            <p className="font-medium text-destructive">{copy.failure.title}</p>
            <p>{failureReasonText(posting)}</p>
          </div>
        ) : null}
      </div>
      <div>
        <JobStatusBadge status={posting.status} />
      </div>
      <p className="text-sm leading-5 text-muted-foreground">
        <span className="md:sr-only">{copy.list.updated(updated)}</span>
        <span aria-hidden="true" className="max-md:hidden">
          {updated}
        </span>
      </p>
      <div className="flex md:justify-end">
        <JobActions posting={posting} layout="list" onNotice={onNotice} />
      </div>
    </article>
  );
}

/**
 * One polite announcement per poll that settled postings ("1 vaga pronta. 1 vaga falhou."), never one per
 * item. Only transitions of postings already on screen count: the first load and new pages announce nothing.
 */
function useStatusAnnouncement(items: JobPostingSummary[]): string {
  const signature = items.map((item) => `${item.id}:${item.status}`).join("|");
  const [seen, setSeen] = useState<{ signature: string; statuses: Map<string, string> } | null>(
    null,
  );
  const [announcement, setAnnouncement] = useState("");
  if (items.length > 0 && seen?.signature !== signature) {
    const statuses = new Map(items.map((item) => [item.id, item.status]));
    if (seen) {
      let ready = 0;
      let failed = 0;
      for (const item of items) {
        const before = seen.statuses.get(item.id);
        if (before === undefined || before === item.status) continue;
        if (item.status === "READY") ready += 1;
        if (item.status === "FAILED") failed += 1;
      }
      const parts = [
        ready > 0 ? copy.list.announce.ready(ready) : null,
        failed > 0 ? copy.list.announce.failed(failed) : null,
      ].filter(Boolean);
      if (parts.length > 0) setAnnouncement(parts.join(" "));
    }
    setSeen({ signature, statuses });
  }
  return announcement;
}
