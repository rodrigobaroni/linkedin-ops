import { z } from "zod";

/** Source kinds. No LinkedIn scraping by design. */
export const SourceTypeSchema = z.enum(["RSS", "ATOM", "URL_LIST"]).meta({ id: "SourceType" });
export const SourceType = SourceTypeSchema.enum;
export type SourceType = z.infer<typeof SourceTypeSchema>;

export const TrustLevelSchema = z.enum(["LOW", "MEDIUM", "HIGH"]).meta({ id: "TrustLevel" });
export const TrustLevel = TrustLevelSchema.enum;
export type TrustLevel = z.infer<typeof TrustLevelSchema>;

export const SourceFetchStatusSchema = z
  .enum(["OK", "FAILED", "BLOCKED"])
  .meta({ id: "SourceFetchStatus" });
export const SourceFetchStatus = SourceFetchStatusSchema.enum;
export type SourceFetchStatus = z.infer<typeof SourceFetchStatusSchema>;
