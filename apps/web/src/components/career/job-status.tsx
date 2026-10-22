import { Badge, type BadgeProps, cn } from "@linkedin-ops/ui";
import { CircleAlertIcon, CircleCheckIcon, LoaderCircleIcon, SearchIcon } from "lucide-react";
import type { ComponentType } from "react";
import { messages } from "@/i18n/pt-br";
import { type JobPostingStatus, type JobPostingSummary, jobDomain } from "@/lib/api";

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

/** What names a posting on screen: its title, else the link's domain (never the link as a link). */
export function jobName(posting: Pick<JobPostingSummary, "title" | "url">): string {
  return posting.title ?? jobDomain(posting.url);
}

/**
 * Safe reason of a `FAILED` posting. `FETCH_BLOCKED` covers LinkedIn switched off, its daily quota and an open
 * breaker alike (the contract does not tell them apart), so the text depends only on the source.
 */
export function failureReasonText(
  posting: Pick<JobPostingSummary, "failureReason" | "source">,
): string {
  const reasons = copy.failure.reasons;
  switch (posting.failureReason) {
    case "FETCH_BLOCKED":
      return posting.source === "LINKEDIN"
        ? reasons.FETCH_BLOCKED_LINKEDIN
        : reasons.FETCH_BLOCKED_OTHER;
    case "NOT_A_JOB":
    case "AI":
    case "TIMED_OUT":
      return reasons[posting.failureReason];
    default:
      return reasons.FETCH;
  }
}
