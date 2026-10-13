import { z } from "zod";

export const CurationRunTriggerSchema = z
  .enum(["CRON", "MANUAL"])
  .meta({ id: "CurationRunTrigger" });
export const CurationRunTrigger = CurationRunTriggerSchema.enum;
export type CurationRunTrigger = z.infer<typeof CurationRunTriggerSchema>;

/** `PARTIAL` = run finished with fewer than 5 opportunities. */
export const CurationRunStatusSchema = z
  .enum(["QUEUED", "RUNNING", "SUCCEEDED", "PARTIAL", "FAILED"])
  .meta({ id: "CurationRunStatus" });
export const CurationRunStatus = CurationRunStatusSchema.enum;
export type CurationRunStatus = z.infer<typeof CurationRunStatusSchema>;
