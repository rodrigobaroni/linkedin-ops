"use client";

import {
  Alert,
  AlertDescription,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
} from "@linkedin-ops/ui";
import { useQueryClient } from "@tanstack/react-query";
import { FileTextIcon } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { messages } from "@/i18n/pt-br";
import { CAREER_CV_QUERY_KEY, isApiProblem } from "@/lib/api";
import type { JobNotice } from "./job-actions";
import { JobBatchForm } from "./job-batch-form";
import { JobList } from "./job-list";
import { useCareerCv } from "./use-career-cv";

const copy = messages.career.jobs;

export type CareerJobsScreenProps = {
  /** Test seam: first polling interval while a posting is processing (3 s by default). */
  pollInitialMs?: number;
};

/**
 * `/carreira/vagas` (career PR 3b, Aurora spec §3): without a confirmed CV base it sends the user to Meu CV;
 * with one, the batch form (1–20 links) and "Suas vagas", polled while anything is being fetched or analyzed.
 * Whether a CV base is active comes from `GET /career/cv`, and every rule (what can be reprocessed, which
 * link is blocked) from the API; the screen only presents them.
 */
export function CareerJobsScreen({ pollInitialMs }: CareerJobsScreenProps) {
  const cv = useCareerCv();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<(JobNotice & { seq: number }) | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);

  function showNotice(next: JobNotice) {
    setNotice((current) => ({ ...next, seq: (current?.seq ?? 0) + 1 }));
  }

  // After an action the control that triggered it may be gone (the posting is processing again, or
  // deleted): focus goes to the outcome instead of falling back to the body.
  const noticeSeq = notice?.seq;
  useEffect(() => {
    if (noticeSeq !== undefined) noticeRef.current?.focus();
  }, [noticeSeq]);

  let main: ReactNode;
  if (cv.isPending) {
    main = <LoadingState label={copy.loading} blocks={1} />;
  } else if (cv.isError && !cv.data) {
    main = (
      <ErrorState
        title={copy.loadError}
        correlationId={isApiProblem(cv.error) ? cv.error.correlationId : undefined}
        actions={
          <Button variant="outline" onClick={() => void cv.refetch()}>
            {copy.retry}
          </Button>
        }
      />
    );
  } else if (cv.data?.active) {
    main = (
      <>
        <JobBatchForm
          onCvRequired={() => void queryClient.invalidateQueries({ queryKey: CAREER_CV_QUERY_KEY })}
        />
        <div ref={noticeRef} tabIndex={-1} className="outline-none empty:hidden">
          {notice ? (
            <Alert
              key={notice.seq}
              variant={notice.tone === "error" ? "destructive" : "success"}
              role={notice.tone === "error" ? "alert" : "status"}
            >
              <AlertDescription>{notice.text}</AlertDescription>
            </Alert>
          ) : null}
        </div>
        <JobList onNotice={showNotice} pollInitialMs={pollInitialMs} />
      </>
    );
  } else {
    main = (
      <EmptyState
        icon={<FileTextIcon />}
        title={copy.noCv.title}
        description={copy.noCv.description}
        actions={
          <Button asChild className="max-sm:w-full max-md:h-11">
            <Link href="/carreira/cv">{copy.noCv.action}</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-8">
      <PageHeader
        title={copy.title}
        description={copy.description}
        breadcrumb={[
          { label: messages.nav.home, href: "/hoje" },
          { label: messages.career.breadcrumb },
        ]}
      />
      {main}
    </div>
  );
}
