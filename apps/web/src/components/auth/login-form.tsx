"use client";

import { Alert, AlertDescription, AlertTitle, Button, FormField, Input } from "@linkedin-ops/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { messages } from "@/i18n/pt-br";
import { type ApiProblem, isApiNetworkError, isApiProblem } from "@/lib/api";
import { formatCountdown } from "@/lib/format-duration";

const copy = messages.auth.login;

/** Default lock when the API sends no usable `Retry-After` (ADR-0007 item 10: 15 min). */
export const DEFAULT_LOCK_SECONDS = 15 * 60;

/**
 * Client-side checks stop at "filled in and well-formed": the password policy is the API's business
 * and a generic error is the only answer to wrong credentials (ADR-0007 item 1).
 */
const LoginFormSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, copy.emailRequired)
    .pipe(z.email(copy.emailInvalid).max(254, copy.emailInvalid)),
  password: z.string().min(1, copy.passwordRequired),
});
type LoginFormValues = z.infer<typeof LoginFormSchema>;

type FormStatus =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string }
  | { kind: "locked"; until: number; since: number };

export type LoginFormProps = {
  onSubmit: (values: LoginFormValues) => Promise<void>;
};

export function LoginForm({ onSubmit }: LoginFormProps) {
  const [status, setStatus] = useState<FormStatus>({ kind: "idle" });
  const remaining = useCountdown(status.kind === "locked" ? status : null);
  const feedbackId = useId();
  const feedbackRef = useRef<HTMLDivElement>(null);
  // The lock ends when the countdown reaches zero; the "released" message replaces the warning.
  const locked = status.kind === "locked" && remaining !== null && remaining > 0;
  const released = status.kind === "locked" && !locked;

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(LoginFormSchema),
    defaultValues: { email: "", password: "" },
    mode: "onSubmit",
    reValidateMode: "onBlur",
  });

  useEffect(() => {
    // Move focus to the feedback once per failure so screen readers hear it (fields keep their values).
    if (status.kind === "error" || status.kind === "locked") feedbackRef.current?.focus();
  }, [status]);

  const submitting = status.kind === "submitting";

  async function submit(values: LoginFormValues) {
    if (locked) return;
    setStatus({ kind: "submitting" });
    try {
      await onSubmit(values);
      // The page navigates away; keep the button disabled meanwhile.
    } catch (cause) {
      // Credentials stay in the fields (accessibility.md 3.3.4); only the alert changes.
      setStatus(statusFromError(cause));
    }
  }

  return (
    <form
      onSubmit={form.handleSubmit(submit)}
      noValidate
      aria-describedby={status.kind === "idle" ? undefined : feedbackId}
      className="flex flex-col gap-5"
    >
      <div ref={feedbackRef} id={feedbackId} tabIndex={-1} className="outline-none empty:hidden">
        {status.kind === "error" ? (
          <Alert variant="destructive">
            <AlertDescription>{status.message}</AlertDescription>
          </Alert>
        ) : null}
        {locked ? (
          <Alert variant="warning" role="alert">
            <AlertTitle>{copy.rateLimitedTitle}</AlertTitle>
            <AlertDescription>
              {/* The countdown is not live: announcing every second would be noise (accessibility.md). */}
              <p aria-live="off" data-testid="login-lock-countdown">
                {copy.rateLimited(formatCountdown(remaining ?? 0))}
              </p>
            </AlertDescription>
          </Alert>
        ) : null}
        {released ? (
          <Alert variant="info" role="status">
            <AlertDescription>{copy.rateLimitReleased}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      <FormField
        label={copy.email}
        description={copy.emailHint}
        error={form.formState.errors.email?.message}
        required
        requiredLabel={messages.auth.required}
      >
        {(control) => (
          <Input
            {...control}
            type="email"
            autoComplete="username"
            inputMode="email"
            spellCheck={false}
            disabled={submitting}
            {...form.register("email")}
          />
        )}
      </FormField>

      <FormField
        label={copy.password}
        error={form.formState.errors.password?.message}
        required
        requiredLabel={messages.auth.required}
      >
        {(control) => (
          <Input
            {...control}
            type="password"
            autoComplete="current-password"
            disabled={submitting}
            {...form.register("password")}
          />
        )}
      </FormField>

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={submitting || locked}
        aria-busy={submitting || undefined}
      >
        {submitting ? copy.submitting : copy.submit}
      </Button>
      <p className="text-sm leading-5 text-muted-foreground">{copy.noAccount}</p>
    </form>
  );
}

function statusFromError(cause: unknown): FormStatus {
  if (isApiProblem(cause, "RATE_LIMITED")) {
    const since = Date.now();
    return { kind: "locked", until: since + lockSeconds(cause) * 1000, since };
  }
  if (isApiProblem(cause, "AUTH_INVALID_CREDENTIALS") || isApiProblem(cause, "VALIDATION_FAILED")) {
    return { kind: "error", message: copy.invalidCredentials };
  }
  if (isApiNetworkError(cause)) return { kind: "error", message: copy.networkError };
  return { kind: "error", message: copy.unexpectedError };
}

function lockSeconds(problem: ApiProblem): number {
  const seconds = problem.retryAfterSeconds;
  return seconds !== undefined && seconds > 0 ? seconds : DEFAULT_LOCK_SECONDS;
}

/** Seconds left until `lock.until` (ms epoch), ticking once per second; `null` without a lock. */
function useCountdown(lock: { until: number; since: number } | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (lock === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [lock]);
  if (lock === null) return null;
  // `now` may predate the lock until the first tick; the lock start is the floor.
  return Math.max(0, Math.ceil((lock.until - Math.max(now, lock.since)) / 1000));
}
