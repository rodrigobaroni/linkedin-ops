import { Badge, type BadgeProps, cn } from "@linkedin-ops/ui";
import { CircleAlertIcon, CircleCheckIcon, LoaderCircleIcon, SearchIcon } from "lucide-react";
import type { ComponentType } from "react";
import { messages } from "@/i18n/pt-br";
import {
  type JobPostingBlockedDetail,
  type JobPostingStatus,
  type JobPostingSummary,
  jobDomain,
} from "@/lib/api";

const copy = messages.career.jobs;

const STATUS_PRESENTATION: Record<
  JobPostingStatus,
  { variant: NonNullable<BadgeProps["variant"]>; icon: ComponentType<{ className?: string }> }
> = {
  FETCHING: { variant: "info", icon: SearchIcon },
  ANALYZING: { variant: "automation", icon: LoaderCircleIcon },
  READY: { variant: "success", icon: CircleCheckIcon },
  FAILED: { variant: "destructive", icon: CircleAlertIcon },
};

/** Status as icon + text (Aurora §3: never colour alone). */
export function JobStatusBadge({ status }: { status: JobPostingStatus }) {
  const { variant, icon: Icon } = STATUS_PRESENTATION[status];
  return (
    <Badge variant={variant} className="text-sm leading-5">
      <Icon
        aria-hidden="true"
        className={cn(status === "ANALYZING" && "motion-safe:animate-spin")}
      />
      {copy.status[status]}
    </Badge>
  );
}

/**
 * What names a posting on screen: its title, else the link's domain (never the link as a link), else
 * "Vaga sem título" (a blank title or a link without a host still gets an accessible name).
 */
export function jobName(posting: Pick<JobPostingSummary, "title" | "url">): string {
  return posting.title?.trim() || jobDomain(posting.url).trim() || copy.detail.untitled;
}

/** `retryAt` as date and time in São Paulo, the owner's reference (blocked fetches, issue #112). */
export function formatRetryAt(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: BLOCKED_RETRY_TIME_ZONE,
  }).format(new Date(iso));
}

export const BLOCKED_RETRY_TIME_ZONE = "America/Sao_Paulo";

/**
 * Safe reason of a `FAILED` posting. For `FETCH_BLOCKED`, the detail's `blockedDetail` (issue #112) says what
 * blocked it and when to try again; without it (the list, a LinkedIn link created blocked in the batch, or a
 * posting from before #112) one sentence per source covers every case.
 */
export function failureReasonText(
  posting: Pick<JobPostingSummary, "failureReason" | "source"> & {
    blockedDetail?: JobPostingBlockedDetail | null;
  },
): string {
  const reasons = copy.failure.reasons;
  switch (posting.failureReason) {
    case "FETCH_BLOCKED": {
      const detail = posting.blockedDetail;
      if (detail) {
        const at = detail.retryAt ? formatRetryAt(detail.retryAt) : null;
        return copy.failure.blocked[detail.kind](at);
      }
      return posting.source === "LINKEDIN"
        ? reasons.FETCH_BLOCKED_LINKEDIN
        : reasons.FETCH_BLOCKED_OTHER;
    }
    case "NOT_A_JOB":
    case "AI":
    case "TIMED_OUT":
      return reasons[posting.failureReason];
    default:
      return reasons.FETCH;
  }
}
