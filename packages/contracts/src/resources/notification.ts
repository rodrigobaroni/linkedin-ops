import { z } from "zod";
import { IsoDateTimeSchema } from "../common/datetime.js";
import { UuidSchema } from "../common/ids.js";
import { PaginationQuerySchema } from "../common/pagination.js";
import {
  NotificationChannelSchema,
  NotificationKindSchema,
  NotificationStatusSchema,
} from "../enums/notification.js";

/** Ids plus short text; never secrets or full prompt content. */
export const NotificationPayloadSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    message: z.string().max(1000).nullable(),
    entityType: z.string().max(64).nullable(),
    entityId: UuidSchema.nullable(),
    draftIds: z.array(UuidSchema).max(50).optional().describe("AUTOPILOT_REVOKED: affected drafts"),
  })
  .meta({ id: "NotificationPayload" });
export type NotificationPayload = z.infer<typeof NotificationPayloadSchema>;

export const NotificationSchema = z
  .object({
    id: UuidSchema,
    channel: NotificationChannelSchema,
    kind: NotificationKindSchema,
    payload: NotificationPayloadSchema,
    dedupeKey: z.string().min(1).max(256),
    status: NotificationStatusSchema,
    sentAt: IsoDateTimeSchema.nullable(),
    readAt: IsoDateTimeSchema.nullable(),
    error: z.string().max(1000).nullable(),
    createdAt: IsoDateTimeSchema,
  })
  .meta({ id: "Notification" });
export type Notification = z.infer<typeof NotificationSchema>;

export const NotificationListQuerySchema = PaginationQuerySchema.extend({
  status: NotificationStatusSchema.optional(),
  kind: NotificationKindSchema.optional(),
});
export type NotificationListQuery = z.infer<typeof NotificationListQuerySchema>;
