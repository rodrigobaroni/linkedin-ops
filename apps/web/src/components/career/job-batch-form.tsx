"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  FormField,
  Spinner,
  Textarea,
} from "@linkedin-ops/ui";
import { useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { messages } from "@/i18n/pt-br";
import {
  JOB_POSTING_LIMITS,
  type TailoringBatchAccepted,
  isApiNetworkError,
  isApiProblem,
  jobDomain,
  parseJobLinks,
} from "@/lib/api";
import { useCareerJobsApi, useInvalidateJobs } from "./use-career-jobs";

const copy = messages.career.jobs.form;

const BatchFormSchema = z.object({
  links: z.string().superRefine((value, ctx) => {
    const { urls, invalidLines } = parseJobLinks(value);
    if (urls.length < JOB_POSTING_LIMITS.minLinks) {
      ctx.addIssue({ code: "custom", message: copy.empty });
    } else if (urls.length > JOB_POSTING_LIMITS.maxLinks) {
      ctx.addIssue({ code: "custom", message: copy.tooMany });
    } else if (invalidLines.length > 0) {
      ctx.addIssue({ code: "custom", message: copy.invalid });
    }
  }),
});
type BatchFormValues = z.infer<typeof BatchFormSchema>;

type Status =
  | { kind: "idle" }
  | { kind: "accepted"; result: TailoringBatchAccepted }
  | { kind: "error"; message: string; detail?: string };

export type JobBatchFormProps = {
  /** `412 CV_BASE_REQUIRED`: the CV base is gone (another tab); the screen reads `GET /career/cv` again. */
  onCvRequired: () => void;
};

/**
 * "Links das vagas" (Aurora §3): 1–20 links, one per line, checked with the contract's URL rule before
 * sending (the API checks again). The counter is plain help text, outside any live region; submission
 * errors go to one alert. After `202`, a per-link summary: queued, or blocked (a LinkedIn link that is not a
 * job view: paste the text), plus how many repeated links the server merged. Links stay in the field on any
 * failure.
 */
export function JobBatchForm({ onCvRequired }: JobBatchFormProps) {
  const api = useCareerJobsApi();
  const invalidate = useInvalidateJobs();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  /** Positions refused by the API (`VALIDATION_FAILED` on `urls[i]`), 1-based. */
  const [serverInvalid, setServerInvalid] = useState<number[]>([]);
  /** Re-mounts (and re-focuses) the feedback on every attempt. */
  const [attempt, setAttempt] = useState(0);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const form = useForm<BatchFormValues>({
    resolver: zodResolver(BatchFormSchema),
    defaultValues: { links: "" },
    mode: "onSubmit",
    reValidateMode: "onChange",
  });
  const text = useWatch({ control: form.control, name: "links" });
  const parsed = parseJobLinks(text);
  const submitting = form.formState.isSubmitting;
  const fieldError = form.formState.errors.links?.message;
  const invalidLines = fieldError === copy.invalid ? parsed.invalidLines : serverInvalid;

  useEffect(() => {
    if (attempt > 0) feedbackRef.current?.focus();
  }, [attempt]);

  async function submit() {
    setServerInvalid([]);
    setStatus({ kind: "idle" });
    try {
      const result = await api.createBatch(parsed.urls);
      form.reset({ links: "" });
      setStatus({ kind: "accepted", result });
      invalidate();
    } catch (cause) {
      if (isApiProblem(cause, "CV_BASE_REQUIRED")) {
        onCvRequired();
        return;
      }
      if (isApiProblem(cause, "VALIDATION_FAILED")) {
        const positions = (cause.errors ?? []).flatMap((issue) =>
          issue.path[0] === "urls" && typeof issue.path[1] === "number" ? [issue.path[1] + 1] : [],
        );
        setServerInvalid([...new Set(positions)].sort((a, b) => a - b));
        setStatus({ kind: "error", message: copy.invalid });
      } else {
        setStatus(errorStatus(cause));
      }
    } finally {
      setAttempt((count) => count + 1);
    }
  }

  return (
    <Card>
      <CardContent>
        <form
          noValidate
          onSubmit={form.handleSubmit(submit)}
          aria-busy={submitting || undefined}
          className="flex flex-col gap-4"
        >
          <FormField
            label={copy.label}
            description={
              <>
                {copy.hint}{" "}
                <span className="whitespace-nowrap">{copy.counter(parsed.urls.length)}</span>
              </>
            }
            error={
              fieldError || invalidLines.length > 0 ? (
                <>
                  {fieldError ?? copy.invalid}
                  {invalidLines.length > 0 ? (
                    <span className="mt-1 flex flex-col">
                      {invalidLines.map((position) => (
                        <span key={position}>{copy.invalidLine(position)}</span>
                      ))}
                    </span>
                  ) : null}
                </>
              ) : undefined
            }
          >
            {(control) => (
              <Textarea
                {...control}
                rows={6}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                placeholder={copy.placeholder}
                readOnly={submitting}
                className="font-mono text-sm md:text-sm"
                {...form.register("links", { onChange: () => setServerInvalid([]) })}
              />
            )}
          </FormField>
          <div>
            <Button type="submit" className="max-sm:w-full max-md:h-11" disabled={submitting}>
              {submitting ? <Spinner /> : null}
              {submitting ? copy.submitting : copy.submit}
            </Button>
          </div>
          <div ref={feedbackRef} tabIndex={-1} className="outline-none empty:hidden">
            <Feedback key={attempt} status={status} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Feedback({ status }: { status: Status }) {
  if (status.kind === "idle") return null;
  if (status.kind === "error") {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>
          <p>{status.message}</p>
          {status.detail ? <p className="break-words">{status.detail}</p> : null}
        </AlertDescription>
      </Alert>
    );
  }
  const { result } = status;
  return (
    <Alert variant="success" role="status">
      <AlertDescription className="flex flex-col gap-2">
        <p>{copy.success}</p>
        <ul className="flex flex-col gap-1">
          {result.postings.map((posting) => (
            <li key={posting.id} className="break-words">
              <span className="font-medium">{jobDomain(posting.url)}</span>
              {": "}
              {posting.status === "FAILED" ? copy.result.blocked : copy.result.queued}
            </li>
          ))}
        </ul>
        {result.duplicatesMerged > 0 ? (
          <p>{copy.result.duplicates(result.duplicatesMerged)}</p>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

function errorStatus(cause: unknown): Status {
  const errors = copy.errors;
  if (isApiProblem(cause, "JOB_POSTING_URL_REJECTED")) {
    // The API's detail names positions only (never the links), e.g. "posição 3".
    return { kind: "error", message: errors.rejected, detail: cause.detail };
  }
  if (isApiProblem(cause, "UPSTREAM_UNAVAILABLE"))
    return { kind: "error", message: errors.unavailable };
  if (isApiProblem(cause, "RATE_LIMITED")) return { kind: "error", message: errors.rateLimited };
  if (isApiNetworkError(cause)) return { kind: "error", message: errors.network };
  return { kind: "error", message: errors.unexpected };
}
