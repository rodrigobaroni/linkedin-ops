"use client";

import { Alert, AlertDescription, Button, Spinner } from "@linkedin-ops/ui";
import { DownloadIcon } from "lucide-react";
import { useState } from "react";
import { messages } from "@/i18n/pt-br";
import {
  TAILORED_CV_FALLBACK_FILENAME,
  isApiNetworkError,
  isApiProblem,
  saveFile,
} from "@/lib/api";
import { type JobNotice, actionErrorText } from "./job-actions";
import { useCareerJobsApi, useInvalidateJobs } from "./use-career-jobs";

const copy = messages.career.jobs.detail.pdf;
const actionsCopy = messages.career.jobs.actions;

/** `stale`: the fix is reprocessing the posting, so the alert offers "Reprocessar". */
type Failure = { message: string; stale: boolean } | null;

/**
 * "Baixar PDF" (Aurora §3; route `GET /career/jobs/{id}/pdf`, PR 3c). The caller renders it only for a
 * `READY` posting with a tailoring. `fetch` → `Blob` → temporary `<a download>`, so an error is shown here in
 * PT-BR (`role="alert"`) instead of the browser opening the Problem JSON. `409 TAILORED_CV_STALE` (the CV base
 * the tailoring used lost items) and `422 TAILORED_CV_TOO_LARGE` offer "Reprocessar"; `429` says when to try again (`Retry-After`). The PDF
 * carries no provenance marks; the file name comes from the API.
 */
export function PdfDownload({
  postingId,
  onNotice,
}: {
  postingId: string;
  onNotice: (notice: JobNotice) => void;
}) {
  const api = useCareerJobsApi();
  const invalidate = useInvalidateJobs();
  const [preparing, setPreparing] = useState(false);
  const [failure, setFailure] = useState<Failure>(null);
  /** Re-mounts the alert on every failed attempt, so it is announced again. */
  const [attempt, setAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false);

  async function download() {
    setFailure(null);
    setPreparing(true);
    try {
      const { blob, filename } = await api.pdf(postingId);
      saveFile(blob, filename ?? TAILORED_CV_FALLBACK_FILENAME);
    } catch (cause) {
      setFailure(failureFrom(cause));
      setAttempt((count) => count + 1);
      if (isApiProblem(cause, "TAILORED_CV_NOT_READY") || isApiProblem(cause, "NOT_FOUND")) {
        invalidate(postingId);
      }
    } finally {
      setPreparing(false);
    }
  }

  async function retry() {
    setRetrying(true);
    try {
      await api.retry(postingId);
      setFailure(null);
      onNotice({ tone: "success", text: actionsCopy.retried });
    } catch (cause) {
      onNotice({ tone: "error", text: actionErrorText(cause) });
    } finally {
      setRetrying(false);
      invalidate(postingId);
    }
  }

  return (
    <div className="flex flex-col gap-2 max-sm:w-full">
      <Button
        className="max-sm:w-full max-md:h-11"
        disabled={preparing}
        aria-busy={preparing || undefined}
        onClick={() => void download()}
      >
        {preparing ? <Spinner /> : <DownloadIcon aria-hidden="true" />}
        {preparing ? copy.preparing : copy.download}
      </Button>
      {failure ? (
        <Alert key={attempt} variant="destructive" role="alert">
          <AlertDescription className="flex flex-col gap-2">
            <p>{failure.message}</p>
            {failure.stale ? (
              <Button
                variant="outline"
                className="w-fit max-sm:w-full max-md:h-11"
                disabled={retrying}
                onClick={() => void retry()}
              >
                {retrying ? <Spinner /> : null}
                {actionsCopy.retry}
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

function failureFrom(cause: unknown): Failure {
  if (isApiProblem(cause, "TAILORED_CV_STALE")) return { message: copy.stale, stale: true };
  // `422` (#116): the tailored CV does not fit the PDF limits; reprocessing tailors it again.
  if (isApiProblem(cause, "TAILORED_CV_TOO_LARGE")) return { message: copy.tooLarge, stale: true };
  if (isApiProblem(cause, "RATE_LIMITED")) {
    const minutes = Math.max(1, Math.ceil((cause.retryAfterSeconds ?? 60) / 60));
    return { message: copy.rateLimited(minutes), stale: false };
  }
  if (isApiProblem(cause, "AUTH_REQUIRED")) return { message: copy.sessionExpired, stale: false };
  if (isApiProblem(cause, "NOT_FOUND")) return { message: copy.notFound, stale: false };
  if (isApiNetworkError(cause))
    return { message: messages.career.jobs.form.errors.network, stale: false };
  return { message: copy.error, stale: false };
}
