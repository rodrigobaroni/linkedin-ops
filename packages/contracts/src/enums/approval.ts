import { z } from "zod";

export const ApprovalDecisionSchema = z
  .enum(["APPROVED", "REJECTED"])
  .meta({ id: "ApprovalDecision" });
export const ApprovalDecision = ApprovalDecisionSchema.enum;
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;
