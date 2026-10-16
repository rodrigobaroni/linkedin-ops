import { z } from "zod";

export const ScheduleStatusSchema = z
  .enum(["PENDING", "DISPATCHED", "CANCELLED"])
  .meta({ id: "ScheduleStatus" });
export const ScheduleStatus = ScheduleStatusSchema.enum;
export type ScheduleStatus = z.infer<typeof ScheduleStatusSchema>;
