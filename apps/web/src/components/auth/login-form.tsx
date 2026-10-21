"use client";

import {
  Alert,
  AlertDescription,
  Button,
  FormField,
  Input,
  PasswordInput,
  Spinner,
} from "@linkedin-ops/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { type Ref, useEffect, useId, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { messages } from "@/i18n/pt-br";
import { type ApiProblem, isApiNetworkError, isApiProblem } from "@/lib/api";
import { formatClock, formatCountdown } from "@/lib/format-duration";

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
  | { kind: "success" }
  | { kind: "error"; message: string }
  | { kind: "locked"; until: number; since: number };

export type LoginFormProps = {
  onSubmit: (values: LoginFormValues) => Promise<void>;
};

/** Login form per Aurora's spec (t015-login-reauth-spec items 6–13 and 19–24). */
export function LoginForm({ onSubmit }: LoginFormProps) {
  const [status, setStatus] = useState<FormStatus>({ kind: "idle" });
  /** Failed attempts: re-mounts the alert so the same message is announced once per attempt. */
  const [attempt, setAttempt] = useState(0);
  const remaining = useCountdown(status.kind === "locked" ? status : null);
  const feedbackId = useId();
  const lockAlertRef = useRef<HTMLDivElement>(null);
  // The lock ends when the countdown reaches zero; the "released" message replaces the warning.
  const locked = status.kind === "locked" && remaining !== null && remaining > 0;
  const released = status.kind === "locked" && !locked;
  const lockedAt = status.kind === "locked" ? status.since : null;

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(LoginFormSchema),
    defaultValues: { email: "", password: "" },
    mode: "onSubmit",
    reValidateMode: "onBlur",
  });

  useEffect(() => {
    // Item 22: focus the alert when the lock starts (other errors are announced without moving focus).
    if (lockedAt !== null) lockAlertRef.current?.focus();
  }, [lockedAt]);

  const submitting = status.kind === "submitting" || status.kind === "success";

  async function submit(values: LoginFormValues) {
    if (locked || submitting) return;
    setStatus({ kind: "submitting" });
    try {
      await onSubmit(values);
      // The page navigates away; keep the fields read-only meanwhile.
      setStatus({ kind: "success" });
    } catch (cause) {
      // Credentials stay in the fields (accessibility.md 3.3.4); only the alert changes.
      setAttempt((count) => count + 1);
      setStatus(statusFromError(cause));
    }
  }

  const hasFeedback = status.kind === "error" || status.kind === "locked";

  return (
    <div className="flex flex-col gap-5">
      <form
        onSubmit={form.handleSubmit(submit)}
        noValidate
        aria-busy={submitting || undefined}
        aria-describedby={hasFeedback ? feedbackId : undefined}
        className="flex flex-col gap-5"
      >
        <div id={feedbackId} className="empty:hidden">
          {status.kind === "error" ? (
            <Alert key={attempt} variant="destructive" role="alert">
              <AlertDescription>{status.message}</AlertDescription>
            </Alert>
          ) : null}
          {locked ? (
            <LockAlert
              ref={lockAlertRef}
              until={status.until}
              since={status.since}
              remaining={remaining}
            />
          ) : null}
          {released ? (
            <Alert variant="info" role="status" aria-live="polite">
              <AlertDescription>{copy.rateLimitReleased}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        <FormField
          label={copy.email}
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
              placeholder={copy.emailPlaceholder}
              className="max-md:h-11"
              readOnly={submitting}
              disabled={locked}
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
            <PasswordInput
              {...control}
              autoComplete="current-password"
              placeholder={copy.passwordPlaceholder}
              showLabel={copy.showPassword}
              hideLabel={copy.hidePassword}
              className="max-md:h-11"
              readOnly={submitting}
              disabled={locked}
              {...form.register("password")}
            />
          )}
        </FormField>

        <Button type="submit" size="lg" className="w-full" disabled={submitting || locked}>
          {submitting ? <Spinner /> : null}
          {submitting ? copy.submitting : copy.submit}
        </Button>

        {/* Item 21: submission and success are announced politely; the spinner is decorative. */}
        <p role="status" aria-live="polite" className="sr-only">
          {status.kind === "submitting" ? copy.submitting : null}
          {status.kind === "success" ? copy.success : null}
        </p>
      </form>
      <p className="text-sm leading-5 text-muted-foreground">{copy.recovery}</p>
    </div>
  );
}

type LockAlertProps = {
  ref: Ref<HTMLDivElement>;
  until: number;
  since: number;
  remaining: number | null;
};

/**
 * Items 11 and 22: the alert text (with the absolute `HH:mm`) is announced once when the lock starts;
 * the `MM:SS` countdown ticks visually every second but is hidden from assistive tech, and a polite
 * status region repeats the remaining time at most once per minute.
 */
function LockAlert({ ref, until, since, remaining }: LockAlertProps) {
  const clock = formatClock(until);
  const seconds = remaining ?? 0;
  const initialMinutes = Math.ceil((until - since) / 60_000);
  const minutesLeft = Math.ceil(seconds / 60);
  return (
    <>
      <Alert
        ref={ref}
        variant="warning"
        role="alert"
        tabIndex={-1}
        className="outline-none focus-visible:outline-2"
      >
        <AlertDescription>
          <p>
            {copy.locked(clock)}{" "}
            <span aria-hidden="true" data-testid="login-lock-countdown">
              ({formatCountdown(seconds)})
            </span>
            .
          </p>
        </AlertDescription>
      </Alert>
      <p role="status" aria-live="polite" className="sr-only" data-testid="login-lock-announcement">
        {minutesLeft < initialMinutes ? copy.lockedAnnouncement(clock, minutesLeft) : null}
      </p>
    </>
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

/** The lock length always comes from the server (`Retry-After`), never from the local clock alone. */
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
