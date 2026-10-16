import { z } from "zod";

/** ADR-0003. `AMBIGUOUS` = call made, outcome unknown; never retried automatically. */
export const PublicationStatusSchema = z
  .enum(["PENDING", "IN_PROGRESS", "SUCCEEDED", "FAILED", "AMBIGUOUS"])
  .meta({ id: "PublicationStatus" });
export const PublicationStatus = PublicationStatusSchema.enum;
export type PublicationStatus = z.infer<typeof PublicationStatusSchema>;
