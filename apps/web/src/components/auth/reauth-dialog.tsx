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
  Input,
} from "@linkedin-ops/ui";
import { type FormEvent, useId, useState } from "react";
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
 * Password confirmation for 🔐 actions (ADR-0007 item 3; accessibility.md "Reautenticação aceita password
 * manager/colar; erro não limpa o formulário principal"). Presentational: the `AuthProvider` opens it and
 * wires the API call. The password never leaves component state.
 */
export function ReauthDialog({ open, onSubmit, onSettled }: ReauthDialogProps) {
  const copy = messages.auth.reauth;
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const errorId = useId();

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
      if (
        isApiProblem(cause, "AUTH_INVALID_CREDENTIALS") ||
        isApiProblem(cause, "VALIDATION_FAILED")
      ) {
        setError(copy.invalid);
      } else if (isApiProblem(cause, "RATE_LIMITED")) {
        setError(messages.auth.login.rateLimitedTitle);
      } else if (isApiNetworkError(cause)) {
        setError(messages.auth.login.networkError);
      } else {
        setError(messages.auth.login.unexpectedError);
      }
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
      <DialogContent hideClose>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>{copy.description}</DialogDescription>
          </DialogHeader>
          {error ? (
            <Alert variant="destructive" id={errorId}>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <FormField
            label={copy.password}
            error={fieldError}
            required
            requiredLabel={messages.auth.required}
          >
            {(control) => (
              <Input
                {...control}
                type="password"
                name="password"
                autoComplete="current-password"
                value={password}
                disabled={submitting}
                onChange={(event) => setPassword(event.target.value)}
              />
            )}
          </FormField>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => onSettled(false)}
            >
              {copy.cancel}
            </Button>
            <Button type="submit" disabled={submitting} aria-busy={submitting || undefined}>
              {submitting ? copy.confirming : copy.confirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
