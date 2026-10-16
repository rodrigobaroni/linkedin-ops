import { z } from "zod";
import { IanaTimezoneSchema, IsoDateTimeSchema, TimeOfDaySchema } from "../common/datetime.js";
import { UuidSchema } from "../common/ids.js";
import { AutonomyModeSchema } from "../enums/autonomy-mode.js";

export const AUTONOMY_MIN_CANCEL_WINDOW_MINUTES = 5;

export const QuietHoursSchema = z
  .strictObject({
    start: TimeOfDaySchema,
    end: TimeOfDaySchema,
    timezone: IanaTimezoneSchema,
  })
  .meta({ id: "QuietHours" });
export type QuietHours = z.infer<typeof QuietHoursSchema>;

const autonomySettingsShape = {
  mode: AutonomyModeSchema,
  autoApproveMinScore: z
    .number()
    .min(0)
    .max(100)
    .nullable()
    .describe("Required in autopilot modes"),
  allowedPillarIds: z
    .array(UuidSchema)
    .max(100)
    .describe("Pillars the autopilot may act on; empty = none"),
  maxAutoPostsPerWeek: z.int().min(0).max(21),
  cancelWindowMinutes: z
    .int()
    .min(AUTONOMY_MIN_CANCEL_WINDOW_MINUTES)
    .max(1440)
    .describe(
      "AUTOPILOT_CONTROLLED: minutes between notification and publish (≥ 5, or CONTROLLED would equal FULL)",
    ),
  mediaRequiresHuman: z
    .boolean()
    .describe("Media is only published with human approval; applies to every mode"),
  assistedPrefetchDraft: z
    .boolean()
    .describe("ASSISTED only: pre-generate a draft for the best candidate"),
  quietHours: QuietHoursSchema.nullable(),
};

function requireScoreInAutopilot(
  value: { mode: string; autoApproveMinScore: number | null },
  ctx: z.RefinementCtx,
): void {
  if (value.mode !== "ASSISTED" && value.autoApproveMinScore === null) {
    ctx.addIssue({
      code: "custom",
      path: ["autoApproveMinScore"],
      message: "autoApproveMinScore is required when mode is not ASSISTED",
    });
  }
}

/** `PUT /settings/autonomy` body (complete replacement). Strict: unknown keys are rejected. */
export const AutonomySettingsInputSchema = z
  .strictObject(autonomySettingsShape)
  .superRefine(requireScoreInAutopilot)
  .meta({ id: "AutonomySettingsInput" });
export type AutonomySettingsInput = z.infer<typeof AutonomySettingsInputSchema>;

/** `GET /settings/autonomy` (contracts.md §3.4). */
export const AutonomySettingsSchema = z
  .object({
    ...autonomySettingsShape,
    updatedAt: IsoDateTimeSchema,
  })
  .superRefine(requireScoreInAutopilot)
  .meta({ id: "AutonomySettings" });
export type AutonomySettings = z.infer<typeof AutonomySettingsSchema>;

/** `PUT /settings/autonomy` response: a mode downgrade revokes pending automatic approvals. */
export const AutonomySettingsUpdateResponseSchema = z
  .object({
    settings: AutonomySettingsSchema,
    revokedDraftIds: z
      .array(UuidSchema)
      .describe("Drafts moved back to IN_REVIEW by the downgrade"),
  })
  .meta({ id: "AutonomySettingsUpdateResponse" });
export type AutonomySettingsUpdateResponse = z.infer<typeof AutonomySettingsUpdateResponseSchema>;
