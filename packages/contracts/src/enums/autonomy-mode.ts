import { z } from "zod";

/** Autonomy levels (data-model.md §2.1). `ASSISTED` is the default. */
export const AutonomyModeSchema = z
  .enum(["ASSISTED", "AUTOPILOT_CONTROLLED", "AUTOPILOT_FULL"])
  .meta({ id: "AutonomyMode" });
export const AutonomyMode = AutonomyModeSchema.enum;
export type AutonomyMode = z.infer<typeof AutonomyModeSchema>;

/** Ordering used to detect a mode downgrade (which revokes automatic approvals). */
export const AUTONOMY_MODE_RANK: Readonly<Record<AutonomyMode, number>> = {
  ASSISTED: 0,
  AUTOPILOT_CONTROLLED: 1,
  AUTOPILOT_FULL: 2,
};
