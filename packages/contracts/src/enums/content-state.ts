import { z } from "zod";

/**
 * Full content lifecycle (briefing §13, data-model.md §3). The opportunity half is persisted on
 * `Opportunity.status` (exposed lowercase); the draft half on `Draft.status`. Briefing's `OPPORTUNITY`
 * state is named `CANDIDATE` here, following data-model.md.
 */
export const ContentStateSchema = z
  .enum([
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
  ])
  .meta({ id: "ContentState" });
export const ContentState = ContentStateSchema.enum;
export type ContentState = z.infer<typeof ContentStateSchema>;

/** Events of the content state machine (data-model.md §3.1, column "Evento"). */
export const ContentEventSchema = z
  .enum([
    "select",
    "dismiss",
    "expire",
    "prefetch",
    "create_draft",
    "generation.succeeded",
    "generation.failed",
    "edit",
    "regenerate",
    "submit_review",
    "approve",
    "reject",
    "schedule",
    "cancel_schedule",
    "revoke_auto_approval",
    "publish_now",
    "dispatch",
    "publication.succeeded",
    "publication.failed",
    "retry",
    "discard",
  ])
  .meta({ id: "ContentEvent" });
export const ContentEvent = ContentEventSchema.enum;
export type ContentEvent = z.infer<typeof ContentEventSchema>;
