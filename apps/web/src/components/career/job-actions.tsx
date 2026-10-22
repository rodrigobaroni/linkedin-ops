"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Spinner,
  Textarea,
} from "@linkedin-ops/ui";
import { EllipsisVerticalIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { messages } from "@/i18n/pt-br";
import {
  JOB_POSTING_LIMITS,
  type JobPostingSummary,
  isApiNetworkError,
  isApiProblem,
  isProcessing,
} from "@/lib/api";
import { jobName } from "./job-status";
import { useCareerJobsApi, useInvalidateJobs } from "./use-career-jobs";

const copy = messages.career.jobs;

export type JobNotice = { tone: "success" | "error"; text: string };

export type JobActionsProps = {
  posting: JobPostingSummary;
  /** `list`: primary action + "Mais ações" menu; `detail`: every action as a button (no report link). */
  layout: "list" | "detail";
  onNotice: (notice: JobNotice) => void;
  /**
   * Offer "Reprocessar" once settled (default). The detail turns it off when the fetch is switched off
   * (`blockedDetail.kind === "DISABLED"`): retrying cannot work, only pasting the text does.
   */
  retryable?: boolean;
  /** After a successful delete (the detail navigates back to the list). */
  onRemoved?: () => void;
};

/**
 * Actions on one posting (Aurora §3): "Ver relatório" when ready; "Colar texto da vaga" when failed;
 * "Reprocessar" and "Apagar vaga" when settled ("Apagar vaga" also while processing). What is allowed is the
 * server's call: a refused action (`409` still processing, `422` a link that can only be pasted) comes back
 * as a notice. Focus returns to the control that opened a dialog, menu included (WebKit does not focus a
 * clicked button, so it is set explicitly).
 */
export function JobActions({
  posting,
  layout,
  onNotice,
  retryable = true,
  onRemoved,
}: JobActionsProps) {
  const api = useCareerJobsApi();
  const invalidate = useInvalidateJobs();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [busy, setBusy] = useState<"retry" | "remove" | null>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const pasteButtonRef = useRef<HTMLButtonElement>(null);
  const retryButtonRef = useRef<HTMLButtonElement>(null);
  const removeButtonRef = useRef<HTMLButtonElement>(null);
  /**
   * Where focus goes when a dialog is dismissed: the button or the menu trigger that opened it. Cleared when
   * the action went through, since the screen then focuses the outcome notice.
   */
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const name = jobName(posting);
  const processing = isProcessing(posting);
  const ready = posting.status === "READY";
  const failed = posting.status === "FAILED";

  function openDialog(which: "paste" | "remove", from: HTMLElement | null) {
    returnFocusRef.current = from;
    setMenuOpen(false);
    if (which === "paste") setPasteOpen(true);
    else setRemoveOpen(true);
  }

  async function retry() {
    setMenuOpen(false);
    setBusy("retry");
    try {
      await api.retry(posting.id);
      onNotice({ tone: "success", text: copy.actions.retried });
    } catch (cause) {
      onNotice({ tone: "error", text: actionErrorText(cause) });
    } finally {
      setBusy(null);
      invalidate(posting.id);
    }
  }

  async function remove() {
    // The outcome notice takes focus (the screen moves it there); the row may be gone.
    returnFocusRef.current = null;
    setRemoveOpen(false);
    setBusy("remove");
    try {
      await api.remove(posting.id);
      onNotice({ tone: "success", text: copy.actions.removed });
      invalidate();
      onRemoved?.();
    } catch (cause) {
      onNotice({ tone: "error", text: actionErrorText(cause) });
      invalidate(posting.id);
    } finally {
      setBusy(null);
    }
  }

  const buttonClass = "max-sm:w-full max-md:h-11";
  const retryLabel = busy === "retry" ? copy.actions.retrying : copy.actions.retry;
  const removeLabel = busy === "remove" ? copy.actions.removing : copy.actions.remove;

  const dialogs = (
    <>
      <PasteTextDialog
        posting={posting}
        open={pasteOpen}
        onOpenChange={setPasteOpen}
        onRestoreFocus={() => returnFocusRef.current?.focus()}
        onDone={(notice) => {
          // The trigger goes away once the posting is processing again: the outcome notice takes focus.
          returnFocusRef.current = null;
          onNotice(notice);
          invalidate(posting.id);
        }}
      />
      <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <DialogContent
          className="sm:max-w-md"
          hideClose
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusRef.current?.focus();
          }}
        >
          <DialogHeader className="pr-0">
            <DialogTitle>{copy.remove.title}</DialogTitle>
            <DialogDescription>{copy.remove.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="max-md:h-11" onClick={() => setRemoveOpen(false)}>
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

  if (layout === "detail") {
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {failed ? (
          <Button
            ref={pasteButtonRef}
            className={buttonClass}
            onClick={() => openDialog("paste", pasteButtonRef.current)}
          >
            {copy.actions.pasteText}
          </Button>
        ) : null}
        {!processing && retryable ? (
          <Button
            ref={retryButtonRef}
            variant="outline"
            className={buttonClass}
            disabled={busy !== null}
            onClick={() => void retry()}
          >
            {busy === "retry" ? <Spinner /> : null}
            {retryLabel}
          </Button>
        ) : null}
        <Button
          ref={removeButtonRef}
          variant="outline"
          className={`text-destructive ${buttonClass}`}
          disabled={busy !== null}
          onClick={() => openDialog("remove", removeButtonRef.current)}
        >
          {busy === "remove" ? <Spinner /> : null}
          {removeLabel}
        </Button>
        {dialogs}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 max-sm:w-full">
      {ready ? (
        <Button asChild className="max-sm:flex-1 max-md:h-11">
          <Link href={`/carreira/vagas/${encodeURIComponent(posting.id)}` as Route}>
            {copy.actions.viewReport}
            <span className="sr-only">: {name}</span>
          </Link>
        </Button>
      ) : null}
      {failed ? (
        <Button
          ref={pasteButtonRef}
          variant="outline"
          className="max-sm:flex-1 max-md:h-11"
          onClick={() => openDialog("paste", pasteButtonRef.current)}
        >
          {copy.actions.pasteText}
          <span className="sr-only">: {name}</span>
        </Button>
      ) : null}
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <Button
            ref={menuTriggerRef}
            variant="ghost"
            size="icon"
            className="shrink-0 max-md:size-11"
            aria-label={copy.actions.more(name)}
            disabled={busy !== null}
          >
            {busy ? <Spinner /> : <EllipsisVerticalIcon aria-hidden="true" />}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="flex w-56 flex-col gap-1 p-1">
          {!processing && retryable ? (
            <Button
              variant="ghost"
              className="justify-start max-md:h-11"
              onClick={() => void retry()}
            >
              {copy.actions.retry}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            className="justify-start text-destructive max-md:h-11"
            onClick={() => openDialog("remove", menuTriggerRef.current)}
          >
            {copy.actions.remove}
          </Button>
        </PopoverContent>
      </Popover>
      {dialogs}
    </div>
  );
}

/** PT-BR text for a refused action; the API's `detail` is never shown (it may change wording). */
export function actionErrorText(cause: unknown): string {
  const errors = copy.actions.errors;
  if (isApiProblem(cause, "JOB_POSTING_INVALID_TRANSITION")) return errors.busy;
  if (isApiProblem(cause, "JOB_POSTING_URL_REJECTED")) return errors.needsText;
  if (isApiProblem(cause, "NOT_FOUND")) return errors.notFound;
  if (isApiProblem(cause, "RATE_LIMITED")) return errors.rateLimited;
  if (isApiProblem(cause, "UPSTREAM_UNAVAILABLE")) return errors.unavailable;
  if (isApiNetworkError(cause)) return copy.form.errors.network;
  return errors.unexpected;
}

const PasteFormSchema = z.object({
  text: z
    .string()
    .trim()
    .min(JOB_POSTING_LIMITS.minTextChars, copy.paste.tooShort)
    .max(JOB_POSTING_LIMITS.maxTextChars, copy.paste.tooLong)
    // The contract refuses NUL characters (`JobPostingTextInputSchema`); say so before sending.
    .refine((value) => !value.includes("\u0000"), copy.paste.invalidChars),
});
type PasteFormValues = z.input<typeof PasteFormSchema>;

/**
 * "Colar texto da vaga" (Aurora §3): 200–20 000 characters (the contract's limits), then
 * `POST /career/jobs/{id}/text`. The pasted text is untrusted data: it is only sent, never rendered back.
 * Radix traps focus and closes on Escape; focus returns to the control that opened it.
 */
function PasteTextDialog({
  posting,
  open,
  onOpenChange,
  onRestoreFocus,
  onDone,
}: {
  posting: JobPostingSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the dialog closes, to put focus back where it came from. */
  onRestoreFocus: () => void;
  onDone: (notice: JobNotice) => void;
}) {
  const api = useCareerJobsApi();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<PasteFormValues>({
    resolver: zodResolver(PasteFormSchema),
    defaultValues: { text: "" },
    mode: "onSubmit",
    reValidateMode: "onChange",
  });
  const length = useWatch({ control: form.control, name: "text" }).trim().length;
  const submitting = form.formState.isSubmitting;

  function setOpen(next: boolean) {
    if (!next) {
      setError(null);
      form.clearErrors();
    }
    onOpenChange(next);
  }

  async function submit(values: PasteFormValues) {
    setError(null);
    try {
      await api.pasteText(posting.id, values.text.trim());
      onDone({ tone: "success", text: copy.paste.done });
      setOpen(false);
      form.reset();
    } catch (cause) {
      setError(actionErrorText(cause));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="sm:max-w-xl"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onRestoreFocus();
        }}
      >
        <form
          noValidate
          onSubmit={form.handleSubmit(submit)}
          aria-busy={submitting || undefined}
          className="flex flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle>{copy.paste.title}</DialogTitle>
            <DialogDescription>{copy.paste.description}</DialogDescription>
          </DialogHeader>
          {error ? (
            <p role="alert" className="text-sm leading-5 text-destructive">
              {error}
            </p>
          ) : null}
          <FormField
            label={copy.paste.label}
            description={copy.paste.counter(length)}
            error={form.formState.errors.text?.message}
          >
            {(control) => (
              <Textarea
                {...control}
                rows={10}
                maxLength={JOB_POSTING_LIMITS.maxTextChars + 1_000}
                placeholder={copy.paste.placeholder}
                readOnly={submitting}
                {...form.register("text")}
              />
            )}
          </FormField>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="max-md:h-11"
              onClick={() => setOpen(false)}
            >
              {copy.paste.cancel}
            </Button>
            <Button type="submit" className="max-md:h-11" disabled={submitting}>
              {submitting ? <Spinner /> : null}
              {submitting ? copy.paste.submitting : copy.paste.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
