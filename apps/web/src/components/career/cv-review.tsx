"use client";

import { Alert, AlertDescription, AlertTitle, Button, Spinner } from "@linkedin-ops/ui";
import type { CvStructured } from "@linkedin-ops/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { TriangleAlertIcon } from "lucide-react";
import { type RefObject, useEffect, useId, useRef, useState } from "react";
import { messages } from "@/i18n/pt-br";
import {
  CAREER_CV_QUERY_KEY,
  type CvBase,
  type CvBaseState,
  isApiNetworkError,
  isApiProblem,
} from "@/lib/api";
import {
  CV_SECTIONS,
  type CvFormValues,
  type CvSection,
  sectionsWithIssues,
  toContent,
  toFormValues,
} from "./cv-form-model";
import { CvSectionEditor } from "./cv-sections";
import { useCareerCvApi } from "./use-career-cv";

const copy = messages.career.cv;

export const CV_REVIEW_TITLE_ID = "cv-review-title";

type Status = { kind: "idle" } | { kind: "confirming" } | { kind: "error"; message: string };

export type CvReviewProps = {
  draftId: string;
  content: CvStructured;
  /** The extraction flagged text that tries to instruct the model: confirming needs an explicit OK. */
  injectionSuspected: boolean;
  /** Flagged excerpt of the CV: untrusted data, rendered as plain text only. */
  injectionEvidence: string | null;
  onConfirmed: (base: CvBase) => void;
  onReplacePdf: () => void;
};

/**
 * Review of the `READY` draft (Aurora spec §2): seven accordion sections over the saved values, each edited
 * and saved on its own; "Confirmar CV base" sends them all (`POST /career/cv/confirm`). Nothing is
 * confirmed while a section still has unsaved edits. A draft flagged as possible prompt injection shows the
 * excerpt and is only sent, with `acknowledgeInjection: true`, after the owner ticks the confirmation; the
 * API refuses it otherwise (`409 CV_INJECTION_UNACKNOWLEDGED`, ADR-0005 §4).
 */
export function CvReview({
  draftId,
  content,
  injectionSuspected,
  injectionEvidence,
  onConfirmed,
  onReplacePdf,
}: CvReviewProps) {
  const api = useCareerCvApi();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<CvFormValues>(() => toFormValues(content));
  const [openSections, setOpenSections] = useState<ReadonlySet<CvSection>>(new Set());
  const [savedSections, setSavedSections] = useState<ReadonlySet<CvSection>>(new Set());
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  /** Re-mounts the alert (and re-focuses it) on each failed attempt. */
  const [attempt, setAttempt] = useState(0);
  const errorRef = useRef<HTMLDivElement>(null);
  const confirming = status.kind === "confirming";
  const [acknowledged, setAcknowledged] = useState(false);
  const [acknowledgeMissing, setAcknowledgeMissing] = useState(false);
  const acknowledgeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (attempt > 0) errorRef.current?.focus();
  }, [attempt]);

  function setOpen(section: CvSection, open: boolean) {
    setOpenSections((current) => {
      const next = new Set(current);
      if (open) next.add(section);
      else next.delete(section);
      return next;
    });
  }

  function fail(message: string) {
    setStatus({ kind: "error", message });
    setAttempt((value) => value + 1);
  }

  async function confirm() {
    if (confirming) return;
    if (openSections.size > 0) {
      const names = CV_SECTIONS.filter((section) => openSections.has(section))
        .map((section) => copy.sections[section])
        .join(", ");
      fail(copy.review.openSections(names));
      return;
    }
    if (injectionSuspected && !acknowledged) {
      setStatus({ kind: "idle" });
      setAcknowledgeMissing(true);
      acknowledgeRef.current?.focus();
      return;
    }
    setStatus({ kind: "confirming" });
    try {
      const input = { draftId, content: toContent(values) };
      const base = await api.confirm(
        injectionSuspected ? { ...input, acknowledgeInjection: true } : input,
      );
      queryClient.setQueryData<CvBaseState>(CAREER_CV_QUERY_KEY, { active: base, draft: null });
      onConfirmed(base);
    } catch (cause) {
      if (
        isApiProblem(cause, "CV_DRAFT_NOT_READY") ||
        isApiProblem(cause, "CV_INJECTION_UNACKNOWLEDGED")
      ) {
        // Replaced by a newer upload (another tab), or flagged after this screen loaded: show the current
        // state (the flag brings the warning and its confirmation).
        void queryClient.invalidateQueries({ queryKey: CAREER_CV_QUERY_KEY });
      }
      fail(confirmErrorMessage(cause));
    }
  }

  return (
    <section aria-labelledby={CV_REVIEW_TITLE_ID} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2
          id={CV_REVIEW_TITLE_ID}
          tabIndex={-1}
          className="text-xl font-semibold leading-7 outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {copy.review.title}
        </h2>
        <p className="max-w-prose text-sm leading-6 text-muted-foreground">
          {copy.review.description}
        </p>
      </div>

      {injectionSuspected ? (
        <InjectionWarning
          evidence={injectionEvidence}
          acknowledged={acknowledged}
          missing={acknowledgeMissing}
          disabled={confirming}
          inputRef={acknowledgeRef}
          onChange={(checked) => {
            setAcknowledged(checked);
            if (checked) setAcknowledgeMissing(false);
          }}
        />
      ) : null}

      {CV_SECTIONS.map((section) => (
        <CvSectionEditor
          key={section}
          section={section}
          values={values}
          open={openSections.has(section)}
          saved={savedSections.has(section)}
          onOpen={() => {
            setOpen(section, true);
            setSavedSections((current) => new Set([...current].filter((s) => s !== section)));
          }}
          onSave={(next) => {
            setValues((current) => ({ ...current, [section]: next[section] }));
            setSavedSections((current) => new Set(current).add(section));
            setOpen(section, false);
          }}
          onCancel={() => setOpen(section, false)}
        />
      ))}

      <div className="flex flex-col gap-3">
        {status.kind === "error" ? (
          <div ref={errorRef} tabIndex={-1} className="outline-none">
            <Alert key={attempt} variant="destructive" role="alert">
              <AlertDescription>{status.message}</AlertDescription>
            </Alert>
          </div>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            size="lg"
            className="max-sm:w-full"
            disabled={confirming}
            onClick={() => void confirm()}
          >
            {confirming ? <Spinner /> : null}
            {confirming ? copy.review.confirming : copy.review.confirm}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="max-sm:w-full"
            disabled={confirming}
            onClick={onReplacePdf}
          >
            {copy.review.replacePdf}
          </Button>
        </div>
        <p role="status" aria-live="polite" className="sr-only">
          {confirming ? copy.review.confirming : null}
        </p>
      </div>
    </section>
  );
}

/**
 * Warning for a draft flagged as possible prompt injection, with the explicit confirmation. The excerpt
 * comes from the uploaded PDF (untrusted): it is a React text child only, never HTML.
 */
function InjectionWarning({
  evidence,
  acknowledged,
  missing,
  disabled,
  inputRef,
  onChange,
}: {
  evidence: string | null;
  acknowledged: boolean;
  missing: boolean;
  disabled: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const checkboxId = `${id}-acknowledge`;
  const text = copy.review.injection;
  return (
    <Alert variant="warning" role="group" aria-labelledby={titleId}>
      <TriangleAlertIcon aria-hidden="true" />
      <AlertTitle id={titleId}>{text.title}</AlertTitle>
      <div className="col-start-2 flex flex-col gap-3">
        <p id={descriptionId}>{text.description}</p>
        {evidence ? (
          <figure className="flex flex-col gap-1">
            <figcaption className="font-medium">{text.evidenceLabel}</figcaption>
            <blockquote className="whitespace-pre-wrap break-words rounded-sm border bg-background px-3 py-2 font-mono text-xs leading-5 text-foreground">
              {evidence}
            </blockquote>
          </figure>
        ) : null}
        <div className="flex min-h-11 items-start gap-2 md:min-h-0">
          <input
            ref={inputRef}
            id={checkboxId}
            type="checkbox"
            className="mt-0.5 size-5 shrink-0 accent-primary"
            checked={acknowledged}
            disabled={disabled}
            aria-invalid={missing || undefined}
            aria-describedby={missing ? `${descriptionId} ${errorId}` : descriptionId}
            onChange={(event) => onChange(event.target.checked)}
          />
          <label htmlFor={checkboxId} className="font-medium">
            {text.acknowledge}
          </label>
        </div>
        {missing ? (
          <p id={errorId} role="alert" className="font-medium text-destructive">
            {text.acknowledgeRequired}
          </p>
        ) : null}
      </div>
    </Alert>
  );
}

function confirmErrorMessage(cause: unknown): string {
  const errors = copy.review.errors;
  if (isApiNetworkError(cause)) return errors.network;
  if (isApiProblem(cause, "CV_DRAFT_NOT_READY")) return errors.CV_DRAFT_NOT_READY;
  if (isApiProblem(cause, "CV_INJECTION_UNACKNOWLEDGED")) return errors.CV_INJECTION_UNACKNOWLEDGED;
  if (isApiProblem(cause, "VALIDATION_FAILED")) {
    const names = sectionsWithIssues(cause.errors ?? []).map((section) => copy.sections[section]);
    return names.length > 0 ? errors.VALIDATION_FAILED(names.join(", ")) : errors.unexpected;
  }
  return errors.unexpected;
}
