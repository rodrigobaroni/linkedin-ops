"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Spinner,
  Textarea,
  cn,
} from "@linkedin-ops/ui";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLinkIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useReauth } from "@/hooks/use-reauth";
import { messages } from "@/i18n/pt-br";
import {
  LINKEDIN_CONNECTION_QUERY_KEY,
  LINKEDIN_POST_MAX_LENGTH,
  PUBLICATIONS_QUERY_KEY,
  type PublicationView,
  canPublish,
  connectionIdentity,
  isApiNetworkError,
  isApiProblem,
  publicationUrl,
} from "@/lib/api";
import { formatClock, minutesUntil } from "@/lib/format-duration";
import { useLinkedInConnection, usePublishingApi } from "./use-publishing";

const copy = messages.publish;
/** Below this many characters left, the counter turns into a warning. */
const NEAR_LIMIT = 200;

type Outcome =
  | { kind: "idle" }
  | { kind: "publishing" }
  | { kind: "cancelled" }
  | { kind: "published"; publication: PublicationView }
  /** The API answered AMBIGUOUS: re-sending would replay the same answer, so nothing is offered. */
  | { kind: "ambiguous"; publication: PublicationView }
  /**
   * Network error or 5xx after the request left the browser: the post may have gone out. Same warning as
   * AMBIGUOUS; only a manual re-send of the SAME attempt (same key, same text) is offered, which the API
   * answers with the existing result instead of publishing again.
   */
  | { kind: "unconfirmed" }
  | { kind: "failed"; message: string; reconnect: boolean };

/**
 * One idempotency key per publication attempt (contracts.md §1): created when the user confirms, reused
 * when the SAME text is re-sent after an unconfirmed (network/5xx) answer, discarded after any definitive
 * answer or when the text changes. A double click therefore can never produce two posts.
 */
type Attempt = { key: string; text: string };

/**
 * Text composer for MVP-0: textarea + counter (LinkedIn's 3000-character limit), escaped plain-text
 * preview, confirmation dialog showing the connected ACCOUNT and the final text (Sentinela item 7), then
 * the 🔐 reauth flow and the synchronous `publish-now` call.
 */
export function PublishComposer() {
  const [text, setText] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });
  const attempt = useRef<Attempt | null>(null);
  const outcomeRef = useRef<HTMLDivElement>(null);
  const counterId = useId();
  const connection = useLinkedInConnection();
  const { publications } = usePublishingApi();
  const { withElevation } = useReauth();
  const queryClient = useQueryClient();

  const length = text.length;
  const trimmed = text.trim();
  const overLimit = length > LINKEDIN_POST_MAX_LENGTH;
  const connected = canPublish(connection.data);
  const unidentified = connection.data?.status === "ACTIVE" && !connected;
  const publishing = outcome.kind === "publishing";
  const canSubmit = connected && trimmed.length > 0 && !overLimit && !publishing;
  const memberName = connection.data?.memberName ?? null;
  const account = connectionIdentity(connection.data);

  function onTextChange(value: string) {
    setText(value);
    if (outcome.kind !== "publishing") setOutcome({ kind: "idle" });
  }

  async function publish() {
    // Defence in depth: the button is disabled without an identified account.
    if (!connected) return;
    const finalText = trimmed;
    if (attempt.current?.text !== finalText) {
      attempt.current = { key: crypto.randomUUID(), text: finalText };
    }
    const { key } = attempt.current;
    setOutcome({ kind: "publishing" });
    try {
      const publication = await withElevation(() =>
        publications.publishNow({ text: finalText }, key),
      );
      if (publication === undefined) {
        // Reauth cancelled: nothing was sent, the key may be reused.
        setOutcome({ kind: "cancelled" });
        return;
      }
      attempt.current = null;
      if (publication.status === "SUCCEEDED") {
        setText("");
        setOutcome({ kind: "published", publication });
      } else if (publication.status === "FAILED") {
        const reconnect = publication.error?.httpStatus === 401;
        setOutcome({
          kind: "failed",
          message: reconnect ? copy.errors.LINKEDIN_REAUTH_REQUIRED : copy.errors.linkedinRejected,
          reconnect,
        });
      } else {
        // AMBIGUOUS (or still in progress): never offer an automatic or one-click retry.
        setOutcome({ kind: "ambiguous", publication });
      }
    } catch (cause) {
      setOutcome(failureFromError(cause, attempt));
    } finally {
      void queryClient.invalidateQueries({ queryKey: PUBLICATIONS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: LINKEDIN_CONNECTION_QUERY_KEY });
    }
  }

  useEffect(() => {
    // The publish button may be disabled now (text cleared): move focus to the result instead.
    if (outcome.kind !== "idle" && outcome.kind !== "publishing") outcomeRef.current?.focus();
  }, [outcome]);

  function confirmAndPublish() {
    setConfirmOpen(false);
    void publish();
  }

  const counterTone = overLimit
    ? "text-destructive"
    : LINKEDIN_POST_MAX_LENGTH - length <= NEAR_LIMIT
      ? "text-warning-foreground"
      : "text-muted-foreground";

  const disabledReason = unidentified
    ? copy.action.needsIdentity
    : !connected
      ? copy.action.needsConnection
      : trimmed.length === 0
        ? copy.action.needsText
        : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <FormField
          label={copy.composer.label}
          error={
            overLimit
              ? copy.composer.overLimit(length - LINKEDIN_POST_MAX_LENGTH, LINKEDIN_POST_MAX_LENGTH)
              : undefined
          }
        >
          {(control) => (
            <>
              <Textarea
                {...control}
                aria-describedby={[control["aria-describedby"], counterId]
                  .filter(Boolean)
                  .join(" ")}
                name="text"
                rows={12}
                placeholder={copy.composer.placeholder}
                value={text}
                readOnly={publishing}
                onChange={(event) => onTextChange(event.target.value)}
              />
              <p
                id={counterId}
                className={cn("text-sm leading-5", counterTone)}
                data-testid="publish-counter"
              >
                {copy.composer.counter(length, LINKEDIN_POST_MAX_LENGTH)}
              </p>
            </>
          )}
        </FormField>

        <Card role="region" aria-label={copy.preview.title} className="gap-3">
          <CardHeader>
            <h2 className="text-lg font-semibold leading-7">{copy.preview.title}</h2>
            <CardDescription>{copy.preview.description}</CardDescription>
          </CardHeader>
          <CardContent>
            {memberName ? (
              <p className="mb-2 text-sm font-semibold leading-5">{memberName}</p>
            ) : null}
            {/* Plain text only: React escapes it; no HTML/markdown rendering (Sentinela item 10). */}
            <p
              data-testid="publish-preview"
              className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground"
            >
              {trimmed.length > 0 ? (
                trimmed
              ) : (
                <span className="text-muted-foreground">{copy.preview.empty}</span>
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button
          size="lg"
          className="sm:w-fit"
          disabled={!canSubmit}
          onClick={() => setConfirmOpen(true)}
        >
          {publishing ? <Spinner /> : null}
          {publishing ? copy.action.publishing : copy.action.publishNow}
        </Button>
        {disabledReason && !publishing ? (
          <p className="text-sm leading-5 text-muted-foreground">{disabledReason}</p>
        ) : null}
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {publishing ? copy.action.publishing : null}
      </p>
      <div ref={outcomeRef} tabIndex={-1} className="outline-none empty:hidden">
        <OutcomeAlert
          outcome={outcome}
          onResendSame={() => void publish()}
          onNewPost={() => setOutcome({ kind: "idle" })}
        />
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" hideClose>
          <DialogHeader className="pr-0">
            <DialogTitle>{copy.confirm.title}</DialogTitle>
            <DialogDescription>{copy.confirm.description}</DialogDescription>
          </DialogHeader>
          <dl className="flex flex-col gap-3 text-sm leading-6">
            <div className="flex flex-col gap-1">
              <dt className="font-medium text-muted-foreground">{copy.confirm.account}</dt>
              <dd data-testid="confirm-account" className="font-semibold">
                {account}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="font-medium text-muted-foreground">
                {copy.confirm.text}{" "}
                <span className="font-normal">({copy.confirm.characters(trimmed.length)})</span>
              </dt>
              <dd
                data-testid="confirm-text"
                className="whitespace-pre-wrap break-words rounded-md border bg-background p-3"
              >
                {trimmed}
              </dd>
            </div>
          </dl>
          <DialogFooter>
            <Button variant="outline" className="max-md:h-11" onClick={() => setConfirmOpen(false)}>
              {copy.confirm.cancel}
            </Button>
            <Button className="max-md:h-11" disabled={!connected} onClick={confirmAndPublish}>
              {copy.confirm.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OutcomeAlert({
  outcome,
  onResendSame,
  onNewPost,
}: {
  outcome: Outcome;
  onResendSame: () => void;
  onNewPost: () => void;
}) {
  if (outcome.kind === "published") {
    const url = publicationUrl(outcome.publication);
    return (
      <Alert variant="success" role="status">
        <AlertTitle>{copy.result.published}</AlertTitle>
        <AlertDescription>
          <div className="flex flex-wrap items-center gap-3">
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-1 font-semibold underline md:min-h-0"
              >
                {copy.result.viewPost}
                <ExternalLinkIcon aria-hidden="true" className="size-4" />
                <span className="sr-only"> {copy.result.opensInNewTab}</span>
              </a>
            ) : null}
            <Button variant="outline" size="sm" onClick={onNewPost}>
              {copy.result.newPost}
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }
  if (outcome.kind === "ambiguous") {
    return (
      <Alert variant="warning" role="alert">
        <AlertTitle>{copy.result.ambiguousTitle}</AlertTitle>
        <AlertDescription>{copy.result.ambiguous}</AlertDescription>
      </Alert>
    );
  }
  if (outcome.kind === "unconfirmed") {
    return (
      <Alert variant="warning" role="alert">
        <AlertTitle>{copy.result.ambiguousTitle}</AlertTitle>
        <AlertDescription>
          <p>{copy.result.unconfirmed}</p>
          <p>{copy.result.resendSameHint}</p>
          <div>
            <Button variant="outline" size="sm" onClick={onResendSame}>
              {copy.result.resendSame}
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }
  if (outcome.kind === "failed") {
    return (
      <Alert variant="destructive" role="alert">
        <AlertTitle>{copy.result.failedTitle}</AlertTitle>
        <AlertDescription>
          <p>{outcome.message}</p>
          {outcome.reconnect ? (
            <p>
              <a href="#linkedin-connection" className="font-semibold underline">
                {copy.connection.reconnect}
              </a>
            </p>
          ) : null}
        </AlertDescription>
      </Alert>
    );
  }
  if (outcome.kind === "cancelled") {
    return (
      <p role="status" className="text-sm leading-5 text-muted-foreground">
        {copy.result.cancelled}
      </p>
    );
  }
  return null;
}

/**
 * Maps a thrown error to the UI. A network error or a 5xx may come after the API already called LinkedIn, so
 * it is never reported as "not published": the attempt (and its key) is kept for a manual re-send. Every
 * other answer is definitive and drops it.
 */
function failureFromError(
  cause: unknown,
  attempt: { current: Attempt | null },
): Extract<Outcome, { kind: "failed" | "unconfirmed" }> {
  const errors = copy.errors;
  if (isApiNetworkError(cause) || (isApiProblem(cause) && cause.status >= 500)) {
    return { kind: "unconfirmed" };
  }
  attempt.current = null;
  if (isApiProblem(cause, "LINKEDIN_REAUTH_REQUIRED")) {
    return { kind: "failed", message: errors.LINKEDIN_REAUTH_REQUIRED, reconnect: true };
  }
  if (isApiProblem(cause, "RATE_LIMITED") && cause.retryAfterSeconds !== undefined) {
    const until = Date.now() + cause.retryAfterSeconds * 1000;
    return {
      kind: "failed",
      message: copy.result.rateLimitedUntil(formatClock(until), minutesUntil(until)),
      reconnect: false,
    };
  }
  if (isApiProblem(cause)) {
    const known = (errors as Record<string, string>)[cause.code];
    return { kind: "failed", message: known ?? errors.unexpected, reconnect: false };
  }
  return { kind: "failed", message: errors.unexpected, reconnect: false };
}
