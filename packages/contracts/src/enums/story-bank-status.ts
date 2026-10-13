import { z } from "zod";

export const StoryBankEntryStatusSchema = z
  .enum(["ACTIVE", "ARCHIVED"])
  .meta({ id: "StoryBankEntryStatus" });
export const StoryBankEntryStatus = StoryBankEntryStatusSchema.enum;
export type StoryBankEntryStatus = z.infer<typeof StoryBankEntryStatusSchema>;
