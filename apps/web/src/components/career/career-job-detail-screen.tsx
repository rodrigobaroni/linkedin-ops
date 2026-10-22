"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  EmptyState,
  ErrorState,
  LoadingState,
  Spinner,
} from "@linkedin-ops/ui";
import { ArrowLeftIcon, BriefcaseBusinessIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { messages } from "@/i18n/pt-br";
import { type JobPostingDetail, isApiProblem, isProcessing, jobDomain } from "@/lib/api";
import { type JobNotice, JobActions, actionErrorText } from "./job-actions";
import { JobReport } from "./job-report";
import { PdfDownload } from "./pdf-download";
import { JobStatusBadge, failureReasonText, jobName } from "./job-status";
import { useCareerCv } from "./use-career-cv";
import {
  isPostingMissing,
  useCareerJob,
  useCareerJobsApi,
  useInvalidateJobs,
} from "./use-career-jobs";

const jobsCopy = messages.career.jobs;
const copy = jobsCopy.detail;

export type CareerJobDetailScreenProps = {
  id: string;
  /** Test seam: first polling interval while the posting is processing (3 s by default). */
  pollInitialMs?: number;
};

/**
 * `/carreira/vagas/{id}` (career PR 3b, Aurora spec §3; "Baixar PDF" over the PR 3c route): the posting's status while
 * it is processed (polled), the safe reason and the actions when it failed, and, when ready, the match report
 * and the tailored CV with provenance (review only, D4). Focus goes to the `h1` once the posting is loaded.
 */
export function CareerJobDetailScreen({ id, pollInitialMs }: CareerJobDetailScreenProps) {
  const job = useCareerJob(id, pollInitialMs);
  const cv = useCareerCv();
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const focused = useRef<string | null>(null);
  const [notice, setNotice] = useState<(JobNotice & { seq: number }) | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const posting = job.data;

  useEffect(() => {
    if (!posting || focused.current === posting.id) return;
    focused.current = posting.id;
    rootRef.current?.querySelector<HTMLElement>("h1")?.focus();
  }, [posting]);

  function showNotice(next: JobNotice) {
    setNotice((current) => ({ ...next, seq: (current?.seq ?? 0) + 1 }));
  }

  // After an action the control that triggered it may be gone (the posting is processing again, or
  // deleted): focus goes to the outcome instead of falling back to the body.
  const noticeSeq = notice?.seq;
  useEffect(() => {
    if (noticeSeq !== undefined) noticeRef.current?.focus();
  }, [noticeSeq]);

  const back = (
    <Button asChild variant="ghost" className="w-fit px-2 max-md:h-11">
      <Link href="/carreira/vagas">
        <ArrowLeftIcon aria-hidden="true" />
        {copy.back}
      </Link>
    </Button>
  );

  let title: string = jobsCopy.title;
  let main: ReactNode;
  if (job.isPending) {
    main = <LoadingState label={copy.loading} blocks={3} />;
  } else if (isPostingMissing(job.error) && !posting) {
    title = copy.notFound;
    main = (
      <EmptyState
        icon={<BriefcaseBusinessIcon />}
        title={copy.notFound}
        description={copy.notFoundDescription}
      />
    );
  } else if (!posting) {
    main = (
      <ErrorState
        title={copy.loadError}
        correlationId={isApiProblem(job.error) ? job.error.correlationId : undefined}
        actions={
          <Button variant="outline" onClick={() => void job.refetch()}>
            {jobsCopy.retry}
          </Button>
        }
      />
    );
  } else {
    title = jobName(posting);
    const active = cv.data?.active ?? null;
    const baseCv =
      posting.tailoring && active?.id === posting.tailoring.cvBaseId ? active.content : null;
    main = (
      <>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <JobStatusBadge status={posting.status} />
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start">
            {posting.status === "READY" && posting.tailoring ? (
              <PdfDownload postingId={posting.id} onNotice={showNotice} />
            ) : null}
            <JobActions
              posting={posting}
              layout="detail"
              onNotice={showNotice}
              retryable={posting.blockedDetail?.kind !== "DISABLED"}
              onRemoved={() => router.push("/carreira/vagas")}
            />
          </div>
        </div>
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
        <p role="status" aria-live="polite" className="sr-only">
          {isProcessing(posting) ? jobsCopy.status[posting.status] : null}
        </p>
        <PostingBody posting={posting} baseCvContent={baseCv} onNotice={showNotice} />
      </>
    );
  }

  const meta = posting
    ? [
        posting.company,
        posting.title ? jobDomain(posting.url) : null,
        jobsCopy.source[posting.source],
      ]
        .filter(Boolean)
        .join(" · ")
    : undefined;

  return (
    <div ref={rootRef} className="mx-auto flex w-full max-w-4xl flex-col gap-6 pb-8">
      <div className="flex flex-col">
        <div className="pt-4">{back}</div>
        <PageHeader
          title={title}
          meta={meta ? <span className="break-words">{meta}</span> : undefined}
          breadcrumb={[
            { label: messages.nav.home, href: "/hoje" },
            { label: messages.career.breadcrumb },
            { label: jobsCopy.title, href: "/carreira/vagas" },
          ]}
        />
      </div>
      {main}
    </div>
  );
}

function PostingBody({
  posting,
  baseCvContent,
  onNotice,
}: {
  posting: JobPostingDetail;
  baseCvContent: Parameters<typeof JobReport>[0]["baseCv"];
  onNotice: (notice: JobNotice) => void;
}) {
  if (posting.status === "FETCHING" || posting.status === "ANALYZING") {
    return (
      <Card aria-busy="true">
        <CardContent className="flex items-center gap-3 text-sm leading-6">
          <Spinner />
          <p>{copy.processing[posting.status]}</p>
        </CardContent>
      </Card>
    );
  }
  if (posting.status === "FAILED") {
    return (
      <Alert variant="destructive" role="alert">
        <AlertTitle>{jobsCopy.failure.title}</AlertTitle>
        <AlertDescription>{failureReasonText(posting)}</AlertDescription>
      </Alert>
    );
  }
  const { tailoring } = posting;
  if (!tailoring) return null;
  const { report } = tailoring;
  return (
    <>
      {tailoring.generatedWithPreviousCv ? (
        <PreviousCvNotice postingId={posting.id} name={jobName(posting)} onNotice={onNotice} />
      ) : null}
      {posting.injectionSuspected ? (
        <Alert variant="warning">
          <AlertTitle>{copy.injection.title}</AlertTitle>
          <AlertDescription className="flex flex-col gap-1">
            <p>{copy.injection.description}</p>
            {posting.injectionEvidence ? (
              <>
                <p className="font-medium">{copy.injection.evidence}</p>
                <blockquote className="border-l-2 pl-3 break-words whitespace-pre-wrap">
                  {posting.injectionEvidence}
                </blockquote>
              </>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      {report.warnings.includes("language_fallback") ? (
        <Alert variant="info">
          <AlertDescription>{copy.warnings.language_fallback}</AlertDescription>
        </Alert>
      ) : null}
      {report.warnings.includes("job_echo") ? (
        <Alert variant="warning">
          <AlertDescription>{copy.warnings.job_echo}</AlertDescription>
        </Alert>
      ) : null}
      {!report.humanizer.passed ? (
        <Alert variant="warning">
          <AlertDescription>{copy.humanizerFlagged}</AlertDescription>
        </Alert>
      ) : null}
      <JobReport report={report} content={tailoring.content} baseCv={baseCvContent} />
    </>
  );
}

/** "Gerado com o CV anterior": the active CV base changed after this tailoring; reprocessing uses the new one. */
function PreviousCvNotice({
  postingId,
  name,
  onNotice,
}: {
  postingId: string;
  name: string;
  onNotice: (notice: JobNotice) => void;
}) {
  const api = useCareerJobsApi();
  const invalidate = useInvalidateJobs();
  const [busy, setBusy] = useState(false);

  async function retry() {
    setBusy(true);
    try {
      await api.retry(postingId);
      onNotice({ tone: "success", text: jobsCopy.actions.retried });
    } catch (cause) {
      onNotice({ tone: "error", text: actionErrorText(cause) });
    } finally {
      setBusy(false);
      invalidate(postingId);
    }
  }

  return (
    <Alert variant="warning">
      <AlertTitle>{copy.previousCv.title}</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <p>{copy.previousCv.description}</p>
        <Button
          variant="outline"
          className="w-fit max-sm:w-full max-md:h-11"
          disabled={busy}
          onClick={() => void retry()}
        >
          {busy ? <Spinner /> : null}
          {copy.previousCv.action}
          <span className="sr-only">: {name}</span>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
