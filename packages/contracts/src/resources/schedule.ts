import { z } from "zod";
import { ActorTypeSchema } from "../common/actor.js";
import { IanaTimezoneSchema, IsoDateTimeSchema, LocalDateTimeSchema } from "../common/datetime.js";
import { UuidSchema } from "../common/ids.js";
import { ScheduleStatusSchema } from "../enums/schedule.js";

/** Scheduled publication. `scheduledAt` (UTC) and `timezone` are always persisted together (I6). */
export const ScheduleSchema = z
  .object({
    id: UuidSchema,
    draftId: UuidSchema,
    draftVersionId: UuidSchema.describe("Version approved at scheduling time"),
    scheduledAt: IsoDateTimeSchema.describe("Computed UTC instant"),
    timezone: IanaTimezoneSchema,
    requestedLocalTime: LocalDateTimeSchema.describe("What the user typed; kept for audit and DST"),
    status: ScheduleStatusSchema,
    jobId: z.string().max(128).nullable(),
    createdByType: ActorTypeSchema,
    cancelledAt: IsoDateTimeSchema.nullable(),
    cancelReason: z.string().max(500).nullable(),
    createdAt: IsoDateTimeSchema,
  })
  .meta({ id: "Schedule" });
export type Schedule = z.infer<typeof ScheduleSchema>;

/** `GET /schedules?from&to` (calendar window). */
export const ScheduleListQuerySchema = z
  .object({
    from: IsoDateTimeSchema,
    to: IsoDateTimeSchema,
  })
  .refine((query) => query.from < query.to, { message: "from must be before to", path: ["to"] });
export type ScheduleListQuery = z.infer<typeof ScheduleListQuerySchema>;
