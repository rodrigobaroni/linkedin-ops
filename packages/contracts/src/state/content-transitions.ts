/**
 * Content state machine as data (data-model.md §3.1). This is the table only: guards, side effects and
 * the single entry point `ContentStateMachine.transition()` live in `packages/domain`.
 */
import type { AuditActorType } from "../common/actor.js";
import type { ContentEvent, ContentState } from "../enums/content-state.js";
import type { OpportunityStatus } from "../enums/opportunity.js";

export interface ContentTransition {
  from: ContentState;
  event: ContentEvent;
  to: ContentState;
  /** Actors allowed to trigger it (subject to domain guards). */
  actors: readonly AuditActorType[];
}

const USER = ["USER"] as const;
const SYSTEM = ["SYSTEM"] as const;
const WORKER = ["WORKER"] as const;
const USER_OR_SYSTEM = ["USER", "SYSTEM"] as const;

const t = (
  from: ContentState,
  event: ContentEvent,
  to: ContentState,
  actors: readonly AuditActorType[],
): ContentTransition => ({
  from,
  event,
  to,
  actors,
});

/** States from which `discard` is allowed: any draft state except PUBLISHING/PUBLISHED (and DISCARDED itself). */
export const DISCARDABLE_STATES: readonly ContentState[] = [
  "GENERATING",
  "DRAFT",
  "IN_REVIEW",
  "APPROVED",
  "SCHEDULED",
  "FAILED",
];

export const CONTENT_TRANSITIONS: readonly ContentTransition[] = [
  // Opportunity
  t("CANDIDATE", "select", "SELECTED", USER_OR_SYSTEM),
  t("CANDIDATE", "dismiss", "DISMISSED", USER),
  t("CANDIDATE", "expire", "EXPIRED", WORKER),
  t("CANDIDATE", "prefetch", "CANDIDATE", WORKER),
  t("SELECTED", "create_draft", "GENERATING", USER_OR_SYSTEM),
  // Generation
  t("GENERATING", "generation.succeeded", "DRAFT", WORKER),
  t("GENERATING", "generation.failed", "FAILED", WORKER),
  // Editing (new version; approval invalidated)
  t("DRAFT", "edit", "DRAFT", USER),
  t("DRAFT", "regenerate", "DRAFT", USER),
  t("IN_REVIEW", "edit", "DRAFT", USER),
  t("IN_REVIEW", "regenerate", "DRAFT", USER),
  t("APPROVED", "edit", "IN_REVIEW", USER),
  t("APPROVED", "regenerate", "IN_REVIEW", USER),
  // Review
  t("DRAFT", "submit_review", "IN_REVIEW", USER_OR_SYSTEM),
  t("IN_REVIEW", "approve", "APPROVED", USER_OR_SYSTEM),
  t("IN_REVIEW", "reject", "DRAFT", USER),
  // Scheduling
  t("APPROVED", "schedule", "SCHEDULED", USER_OR_SYSTEM),
  t("SCHEDULED", "cancel_schedule", "APPROVED", USER),
  t("APPROVED", "revoke_auto_approval", "IN_REVIEW", SYSTEM),
  t("SCHEDULED", "revoke_auto_approval", "IN_REVIEW", SYSTEM),
  // Publishing
  t("APPROVED", "publish_now", "PUBLISHING", USER_OR_SYSTEM),
  t("SCHEDULED", "dispatch", "PUBLISHING", WORKER),
  t("PUBLISHING", "publication.succeeded", "PUBLISHED", WORKER),
  t("PUBLISHING", "publication.failed", "FAILED", WORKER),
  t("FAILED", "retry", "APPROVED", USER),
  // Discard
  ...DISCARDABLE_STATES.map((from) => t(from, "discard", "DISCARDED", USER)),
];

/** True when at least one event leads from `from` to `to` (ignoring guards). */
export function canTransition(from: ContentState, to: ContentState): boolean {
  return CONTENT_TRANSITIONS.some((transition) => transition.from === from && transition.to === to);
}

/** All transitions leaving `from`. */
export function transitionsFrom(from: ContentState): readonly ContentTransition[] {
  return CONTENT_TRANSITIONS.filter((transition) => transition.from === from);
}

/** Target state of `event` from `from`, or `null` when the event is not allowed there. */
export function resolveTransition(from: ContentState, event: ContentEvent): ContentState | null {
  return (
    CONTENT_TRANSITIONS.find((transition) => transition.from === from && transition.event === event)
      ?.to ?? null
  );
}

/** States with no outgoing transition. */
export const TERMINAL_CONTENT_STATES: readonly ContentState[] = (
  [
    "CANDIDATE",
    "SELECTED",
    "DISMISSED",
    "EXPIRED",
    "GENERATING",
    "DRAFT",
    "IN_REVIEW",
    "APPROVED",
    "SCHEDULED",
    "PUBLISHING",
    "PUBLISHED",
    "FAILED",
    "DISCARDED",
  ] as const
).filter((state) => transitionsFrom(state).length === 0);

/** `Opportunity.status` (lowercase, briefing §13) ⇄ `ContentState`. */
export const OPPORTUNITY_STATUS_TO_CONTENT_STATE: Readonly<
  Record<OpportunityStatus, ContentState>
> = {
  candidate: "CANDIDATE",
  selected: "SELECTED",
  dismissed: "DISMISSED",
  expired: "EXPIRED",
};
