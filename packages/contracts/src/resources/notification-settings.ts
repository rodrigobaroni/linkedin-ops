import { z } from "zod";
import { IsoDateTimeSchema } from "../common/datetime.js";

/** `GET /settings/notifications`. The Telegram chat id is only ever shown masked. */
export const NotificationSettingsSchema = z
  .object({
    telegram: z.object({
      enabled: z.boolean(),
      linked: z.boolean().describe("A chat has been linked through the pairing code"),
      chatIdMasked: z.string().max(32).nullable().describe("Masked chat id, e.g. ***1234"),
      linkedAt: IsoDateTimeSchema.nullable(),
    }),
    inApp: z.object({
      enabled: z.boolean(),
    }),
  })
  .meta({ id: "NotificationSettings" });
export type NotificationSettings = z.infer<typeof NotificationSettingsSchema>;

/** `PUT /settings/notifications` body. */
export const NotificationSettingsInputSchema = z
  .object({
    telegram: z.object({ enabled: z.boolean() }),
    inApp: z.object({ enabled: z.boolean() }),
  })
  .meta({ id: "NotificationSettingsInput" });
export type NotificationSettingsInput = z.infer<typeof NotificationSettingsInputSchema>;
