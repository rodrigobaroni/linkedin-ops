"use client";

import type { ReauthInput } from "@linkedin-ops/contracts";
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  PasswordInput,
  Spinner,
} from "@linkedin-ops/ui";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { messages } from "@/i18n/pt-br";
import { isApiNetworkError, isApiProblem } from "@/lib/api";

export type ReauthDialogProps = {
  open: boolean;
  /** Performs `POST /auth/reauth`; rejects with `ApiProblem`/`ApiNetworkError`. */
  onSubmit: (input: ReauthInput) => Promise<void>;
  /** `true` after a successful confirmation, `false` when the user cancels. */
  onSettled: (elevated: boolean) => void;
};

/**
 * Password confirmation for 🔐 actions (ADR-0007 item 3; Aurora spec items 14–18 and 23). Presentational:
 * the `AuthProvider` opens it, wires the API call and announces the elevation deadline after success.
 * The password never leaves component state and is cleared whenever the dialog closes.
 */
export function ReauthDialog({ open, onSubmit, onSettled }: ReauthDialogProps) {
  const copy = messages.auth.reauth;
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ message: string; attempt: number } | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const attempts = useRef(0);
  // Item 23: focus goes back to the control that started the protected action (the dialog has no trigger).
  const returnFocusTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open && document.activeElement instanceof HTMLElement) {
      returnFocusTo.current = document.activeElement;
    }
  }, [open]);

  /** Closes the dialog and forgets the password and any error. */
  function close(elevated: boolean) {
    setPassword("");
    setError(null);
    setFieldError(null);
    setSubmitting(false);
    onSettled(elevated);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (password.length === 0) {
      setFieldError(messages.auth.login.passwordRequired);
      return;
    }
    setFieldError(null);
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({ password });
      close(true);
      return;
    } catch (cause) {
      attempts.current += 1;
      setError({ message: reauthErrorMessage(cause), attempt: attempts.current });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !submitting) close(false);
      }}
    >
      <DialogContent
        hideClose
        className="sm:max-w-[440px]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          const target = returnFocusTo.current;
          if (target?.isConnected) {
            event.preventDefault();
            target.focus();
          }
          returnFocusTo.current = null;
        }}
      >
        <form
          onSubmit={handleSubmit}
          noValidate
          aria-busy={submitting || undefined}
          aria-describedby={error ? errorId : undefined}
          className="flex flex-col gap-4"
        >
          <DialogHeader className="pr-0">
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>{copy.description}</DialogDescription>
          </DialogHeader>
          <FormField
            label={copy.password}
            error={fieldError}
            required
            requiredLabel={messages.auth.required}
          >
            {(control) => (
              <PasswordInput
                {...control}
                ref={inputRef}
                name="password"
                autoComplete="current-password"
                placeholder={copy.passwordPlaceholder}
                showLabel={messages.auth.login.showPassword}
                hideLabel={messages.auth.login.hidePassword}
                className="max-md:h-11"
                value={password}
                readOnly={submitting}
                onChange={(event) => setPassword(event.target.value)}
              />
            )}
          </FormField>
          <div id={errorId} className="empty:hidden">
            {error ? (
              <Alert key={error.attempt} variant="destructive" role="alert">
                <AlertDescription>{error.message}</AlertDescription>
              </Alert>
            ) : null}
          </div>
          <p role="status" aria-live="polite" className="sr-only">
            {submitting ? copy.confirming : null}
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="max-md:h-11"
              disabled={submitting}
              onClick={() => close(false)}
            >
              {copy.cancel}
            </Button>
            <Button type="submit" className="max-md:h-11" disabled={submitting}>
              {submitting ? <Spinner /> : null}
              {submitting ? copy.confirming : copy.confirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function reauthErrorMessage(cause: unknown): string {
  const copy = messages.auth.reauth;
  if (isApiProblem(cause, "AUTH_INVALID_CREDENTIALS") || isApiProblem(cause, "VALIDATION_FAILED")) {
    return copy.invalid;
  }
  if (isApiProblem(cause, "RATE_LIMITED")) return copy.rateLimited;
  if (isApiNetworkError(cause)) return messages.auth.login.networkError;
  return copy.invalid;
}
