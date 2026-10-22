"use client";

import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ErrorState,
  LoadingState,
  Spinner,
} from "@linkedin-ops/ui";
import { useQueryClient } from "@tanstack/react-query";
import { CircleCheckIcon } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { formatDateTime } from "@/components/publish/use-publishing";
import { PageHeader } from "@/components/shell/page-header";
import { useReauth } from "@/hooks/use-reauth";
import { messages } from "@/i18n/pt-br";
import {
  CAREER_CV_QUERY_KEY,
  type CvBase,
  type CvBaseState,
  type CvDraft,
  isApiNetworkError,
  isApiProblem,
} from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";
import { CV_SECTIONS, toFormValues } from "./cv-form-model";
import { CV_REVIEW_TITLE_ID, CvReview } from "./cv-review";
import { CvSectionSummary } from "./cv-sections";
import { CvReadingNotice, CvUploadCard } from "./cv-upload-card";
import { useCareerCv, useCareerCvApi } from "./use-career-cv";

const copy = messages.career.cv;
const CONFIRMED_TITLE_ID = "cv-confirmed-title";

/** Upload refusals: about the file itself (shown at the picker) or about reading it (error card). */
type UploadError = { kind: "file"; message: string } | { kind: "reading"; reason: string } | null;

type Notice = { kind: "deleted" } | { kind: "deleteCancelled" } | { kind: "deleteFailed" };

export type CareerCvScreenProps = {
  /** Test seam: first polling interval while the draft is `EXTRACTING` (2 s by default). */
  pollInitialMs?: number;
};

/**
 * `/carreira/cv` (career module PR 2, Aurora spec §2): send the CV PDF, wait while the worker reads it
 * (polling), review and confirm the seven sections, replace or delete (🔐). The panel shown is decided by
 * the server state `{ active, draft }`, so leaving the screen and coming back resumes wherever it is.
 */
export function CareerCvScreen({ pollInitialMs }: CareerCvScreenProps) {
  const { user } = useAuth();
  const api = useCareerCvApi();
  const queryClient = useQueryClient();
  const cv = useCareerCv(pollInitialMs);
  const [replacing, setReplacing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<UploadError>(null);
  /** Last file sent from this tab, for "Tentar novamente" (memory only; gone on reload). */
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const timeZone = user?.timezone;

  const active = cv.data?.active ?? null;
  const draft = cv.data?.draft ?? null;
  const extracting = draft?.status === "EXTRACTING";

  // Focus follows the process (Aurora a11y): reading done → "Revise seu CV"; confirmed → the badge.
  // A request is honoured once, on the first render where its target exists (the query cache update
  // that mounts it may land a render later than the request).
  const [focusRequest, setFocusRequest] = useState<{ id: string; seq: number } | null>(null);
  const handledFocus = useRef(0);
  const requestFocus = (id: string) =>
    setFocusRequest((current) => ({ id, seq: (current?.seq ?? 0) + 1 }));
  const [seenStatus, setSeenStatus] = useState(draft?.status ?? null);
  if ((draft?.status ?? null) !== seenStatus) {
    setSeenStatus(draft?.status ?? null);
    if (seenStatus === "EXTRACTING" && draft?.status === "READY") requestFocus(CV_REVIEW_TITLE_ID);
  }
  useEffect(() => {
    if (!focusRequest || handledFocus.current === focusRequest.seq) return;
    const target = document.getElementById(focusRequest.id);
    if (!target) return;
    handledFocus.current = focusRequest.seq;
    target.focus();
  });

  useEffect(() => {
    // A cancelled delete is the exception: focus goes back to "Apagar CV" and the status is announced.
    if (notice && notice.kind !== "deleteCancelled") noticeRef.current?.focus();
  }, [notice]);

  async function upload(file: File) {
    setLastFile(file);
    setUploadError(null);
    setNotice(null);
    setUploading(true);
    try {
      const accepted = await api.upload(file);
      queryClient.setQueryData<CvBaseState>(CAREER_CV_QUERY_KEY, (current) => ({
        active: current?.active ?? null,
        draft: accepted.draft,
      }));
      setReplacing(false);
    } catch (cause) {
      setUploadError(uploadErrorFrom(cause));
    } finally {
      setUploading(false);
    }
  }

  function startReplace() {
    setNotice(null);
    setUploadError(null);
    setReplacing(true);
  }

  function cancelReplace() {
    setUploadError(null);
    setReplacing(false);
  }

  let main: ReactNode;
  if (cv.isPending) {
    main = <LoadingState label={copy.loading} blocks={2} />;
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
  } else {
    const failure = readingFailure(draft, uploadError);
    const uploadVariant = failure ? "error" : replacing ? "replace" : "empty";
    const showUpload =
      uploading ||
      failure !== null ||
      replacing ||
      uploadError?.kind === "file" ||
      (!active && !draft);
    const confirmedCard = active ? (
      <ConfirmedCv
        base={active}
        timeZone={timeZone}
        canReplace={!replacing && !uploading && !draft}
        onReplace={startReplace}
        onDeleted={setNotice}
      />
    ) : null;

    if (showUpload) {
      main = (
        <>
          <CvUploadCard
            // A new variant starts with no file picked.
            key={uploadVariant}
            variant={uploadVariant}
            errorReason={failure ?? undefined}
            uploading={uploading}
            fileError={uploadError?.kind === "file" ? uploadError.message : null}
            lastFile={lastFile}
            onSubmit={(file) => void upload(file)}
            onCancel={replacing && !failure ? cancelReplace : undefined}
          />
          {confirmedCard}
        </>
      );
    } else if (extracting) {
      main = (
        <>
          <Card aria-busy="true">
            <CardContent>
              <CvReadingNotice />
            </CardContent>
          </Card>
          {confirmedCard}
        </>
      );
    } else if (draft?.status === "READY" && draft.content) {
      main = (
        <CvReview
          key={draft.id}
          draftId={draft.id}
          content={draft.content}
          onConfirmed={() => requestFocus(CONFIRMED_TITLE_ID)}
          onReplacePdf={startReplace}
        />
      );
    } else {
      main = confirmedCard;
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 pb-8">
      <PageHeader
        title={copy.title}
        description={copy.description}
        breadcrumb={[
          { label: messages.nav.home, href: "/hoje" },
          { label: messages.career.breadcrumb },
        ]}
      />
      <p role="status" aria-live="polite" className="sr-only">
        {uploading || extracting ? copy.reading.title : null}
      </p>
      <div ref={noticeRef} tabIndex={-1} className="outline-none empty:hidden">
        <NoticeAlert notice={notice} />
      </div>
      {main}
    </div>
  );
}

/** PT-BR safe reason when the last reading failed (failed draft or refused upload), else `null`. */
function readingFailure(draft: CvDraft | null, uploadError: UploadError): string | null {
  if (uploadError?.kind === "reading") return uploadError.reason;
  if (draft?.status === "FAILED") {
    return copy.error.reasons[draft.failureReason ?? "EXTRACTION_FAILED"];
  }
  return null;
}

function uploadErrorFrom(cause: unknown): UploadError {
  const reasons = copy.error.reasons;
  if (
    isApiProblem(cause, "PAYLOAD_TOO_LARGE") ||
    isApiProblem(cause, "UNSUPPORTED_MEDIA_TYPE") ||
    isApiProblem(cause, "VALIDATION_FAILED")
  ) {
    return { kind: "file", message: copy.upload.invalidFile };
  }
  if (isApiProblem(cause, "CV_PDF_UNREADABLE")) {
    return { kind: "reading", reason: reasons.CV_PDF_UNREADABLE };
  }
  if (isApiProblem(cause, "RATE_LIMITED")) return { kind: "reading", reason: reasons.RATE_LIMITED };
  if (isApiNetworkError(cause)) return { kind: "reading", reason: reasons.network };
  return { kind: "reading", reason: reasons.unexpected };
}

function ConfirmedCv({
  base,
  timeZone,
  canReplace,
  onReplace,
  onDeleted,
}: {
  base: CvBase;
  timeZone: string | undefined;
  canReplace: boolean;
  onReplace: () => void;
  onDeleted: (notice: Notice) => void;
}) {
  const values = toFormValues(base.content);
  return (
    <section aria-labelledby={CONFIRMED_TITLE_ID} className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h2
              id={CONFIRMED_TITLE_ID}
              tabIndex={-1}
              className="w-fit outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <Badge variant="success" className="text-sm leading-5">
                <CircleCheckIcon aria-hidden="true" />
                {copy.confirmed.badge}
              </Badge>
            </h2>
            <p className="text-sm leading-6">{copy.confirmed.description}</p>
            <p className="text-sm leading-6 text-muted-foreground">
              {copy.confirmed.meta(base.version, formatDateTime(base.confirmedAt, timeZone))}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild className="max-sm:w-full max-md:h-11">
              <Link href="/carreira/vagas">{copy.confirmed.viewJobs}</Link>
            </Button>
            {canReplace ? (
              <Button variant="outline" className="max-sm:w-full max-md:h-11" onClick={onReplace}>
                {copy.confirmed.replace}
              </Button>
            ) : null}
            <DeleteCvButton onDone={onDeleted} />
          </div>
        </CardContent>
      </Card>
      {CV_SECTIONS.map((section) => (
        <Card key={section} className="gap-3">
          <CardContent className="flex flex-col gap-2 text-sm leading-6">
            <h3 className="text-base font-semibold leading-6">{copy.sections[section]}</h3>
            <CvSectionSummary section={section} values={values} />
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

function NoticeAlert({ notice }: { notice: Notice | null }) {
  if (!notice) return null;
  if (notice.kind === "deleted") {
    return (
      <Alert variant="success" role="status">
        <AlertDescription>{copy.remove.done}</AlertDescription>
      </Alert>
    );
  }
  if (notice.kind === "deleteCancelled") {
    return (
      <p role="status" className="text-sm leading-5 text-muted-foreground">
        {copy.remove.cancelled}
      </p>
    );
  }
  return (
    <Alert variant="destructive" role="alert">
      <AlertDescription>{copy.remove.error}</AlertDescription>
    </Alert>
  );
}

/**
 * "Apagar CV": confirmation dialog, then the 🔐 flow (`DELETE /career/cv` destroys personal data and, in
 * cascade, the analyses made with it). No native `confirm()`. Focus returns to this button explicitly when
 * either dialog is dismissed: WebKit (the Maestri portal, Safari) does not focus a clicked button, so the
 * previously focused element would be the body.
 */
function DeleteCvButton({ onDone }: { onDone: (notice: Notice) => void }) {
  const api = useCareerCvApi();
  const queryClient = useQueryClient();
  const { withElevation } = useReauth();
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  /** Set when "Apagar CV" in the dialog was chosen: the password dialog takes focus instead. */
  const confirmed = useRef(false);

  async function remove() {
    confirmed.current = true;
    setOpen(false);
    setRemoving(true);
    try {
      const done = await withElevation(async () => (await api.remove(), true), {
        returnFocusTo: buttonRef.current,
      });
      if (done === undefined) {
        onDone({ kind: "deleteCancelled" });
        return;
      }
      queryClient.setQueryData<CvBaseState>(CAREER_CV_QUERY_KEY, { active: null, draft: null });
      onDone({ kind: "deleted" });
    } catch {
      void queryClient.invalidateQueries({ queryKey: CAREER_CV_QUERY_KEY });
      onDone({ kind: "deleteFailed" });
    } finally {
      setRemoving(false);
    }
  }

  return (
    <>
      <Button
        ref={buttonRef}
        variant="outline"
        className="text-destructive max-sm:w-full max-md:h-11"
        disabled={removing}
        onClick={() => {
          confirmed.current = false;
          setOpen(true);
        }}
      >
        {removing ? <Spinner /> : null}
        {removing ? copy.remove.removing : copy.confirmed.remove}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="sm:max-w-md"
          hideClose
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (!confirmed.current) buttonRef.current?.focus();
          }}
        >
          <DialogHeader className="pr-0">
            <DialogTitle>{copy.remove.title}</DialogTitle>
            <DialogDescription>{copy.remove.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="max-md:h-11" onClick={() => setOpen(false)}>
              {copy.remove.cancel}
            </Button>
            <Button variant="destructive" className="max-md:h-11" onClick={() => void remove()}>
              {copy.remove.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
