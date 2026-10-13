import { z } from "zod";

/** Briefing §13: exposed in lowercase for fidelity to the brief. */
export const OpportunityStatusSchema = z
  .enum(["candidate", "selected", "dismissed", "expired"])
  .meta({ id: "OpportunityStatus" });
export const OpportunityStatus = OpportunityStatusSchema.enum;
export type OpportunityStatus = z.infer<typeof OpportunityStatusSchema>;

export const OpportunityOriginSchema = z
  .enum(["CURATION", "MANUAL"])
  .meta({ id: "OpportunityOrigin" });
export const OpportunityOrigin = OpportunityOriginSchema.enum;
export type OpportunityOrigin = z.infer<typeof OpportunityOriginSchema>;

/** Briefing §13 `suggestedFormat`. Shared by the API DTOs and the model Structured Outputs. */
export const SuggestedFormatSchema = z
  .enum(["text", "code-card", "image", "carousel"])
  .meta({ id: "SuggestedFormat" });
export const SuggestedFormat = SuggestedFormatSchema.enum;
export type SuggestedFormat = z.infer<typeof SuggestedFormatSchema>;

/** Media formats a draft version can suggest (`text` means no media, hence excluded). */
export const MediaFormatSchema = z
  .enum(["code-card", "image", "carousel"])
  .meta({ id: "MediaFormat" });
export const MediaFormat = MediaFormatSchema.enum;
export type MediaFormat = z.infer<typeof MediaFormatSchema>;
