"use client";

import { Alert, AlertDescription, Button, Spinner } from "@linkedin-ops/ui";
import type { CvStructured } from "@linkedin-ops/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
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
  onConfirmed: (base: CvBase) => void;
  onReplacePdf: () => void;
};

/**
 * Review of the `READY` draft (Aurora spec §2): seven accordion sections over the saved values, each edited
 * and saved on its own; "Confirmar CV base" sends them all (`POST /career/cv/confirm`). Nothing is
 * confirmed while a section still has unsaved edits.
 */
export function CvReview({ draftId, content, onConfirmed, onReplacePdf }: CvReviewProps) {
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
    setStatus({ kind: "confirming" });
    try {
      const base = await api.confirm({ draftId, content: toContent(values) });
      queryClient.setQueryData<CvBaseState>(CAREER_CV_QUERY_KEY, { active: base, draft: null });
      onConfirmed(base);
    } catch (cause) {
      if (isApiProblem(cause, "CV_DRAFT_NOT_READY")) {
        // Replaced by a newer upload (another tab): show the current state instead of this draft.
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

function confirmErrorMessage(cause: unknown): string {
  const errors = copy.review.errors;
  if (isApiNetworkError(cause)) return errors.network;
  if (isApiProblem(cause, "CV_DRAFT_NOT_READY")) return errors.CV_DRAFT_NOT_READY;
  if (isApiProblem(cause, "VALIDATION_FAILED")) {
    const names = sectionsWithIssues(cause.errors ?? []).map((section) => copy.sections[section]);
    return names.length > 0 ? errors.VALIDATION_FAILED(names.join(", ")) : errors.unexpected;
  }
  return errors.unexpected;
}
