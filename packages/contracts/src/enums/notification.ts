import { z } from "zod";

export const NotificationChannelSchema = z
  .enum(["TELEGRAM", "IN_APP"])
  .meta({ id: "NotificationChannel" });
export const NotificationChannel = NotificationChannelSchema.enum;
export type NotificationChannel = z.infer<typeof NotificationChannelSchema>;

/** contracts.md §2.11 (`DRAFT_PREFETCHED`, `AUTOPILOT_REVOKED` added 2026-10-13, PRD v0.2 §6). */
export const NotificationKindSchema = z
  .enum([
    "CURATION_READY",
    "DRAFT_READY",
    "DRAFT_PREFETCHED",
    "APPROVAL_NEEDED",
    "AUTOPILOT_WILL_PUBLISH",
    "AUTOPILOT_PUBLISHED",
    "AUTOPILOT_REVOKED",
    "PUBLISHED",
    "PUBLICATION_FAILED",
    "PUBLICATION_AMBIGUOUS",
    "TOKEN_EXPIRING",
    "REAUTH_REQUIRED",
    "RUN_FAILED",
  ])
  .meta({ id: "NotificationKind" });
export const NotificationKind = NotificationKindSchema.enum;
export type NotificationKind = z.infer<typeof NotificationKindSchema>;

export const NotificationStatusSchema = z
  .enum(["PENDING", "SENT", "FAILED", "READ"])
  .meta({ id: "NotificationStatus" });
export const NotificationStatus = NotificationStatusSchema.enum;
export type NotificationStatus = z.infer<typeof NotificationStatusSchema>;
