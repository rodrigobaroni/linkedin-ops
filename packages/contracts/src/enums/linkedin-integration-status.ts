import { z } from "zod";

/** Status of the LinkedIn OAuth connection as exposed by the API (never the token itself). */
export const LinkedInIntegrationStatusSchema = z
  .enum(["DISCONNECTED", "ACTIVE", "EXPIRED", "REAUTH_REQUIRED"])
  .meta({ id: "LinkedInIntegrationStatus" });
export const LinkedInIntegrationStatus = LinkedInIntegrationStatusSchema.enum;
export type LinkedInIntegrationStatus = z.infer<typeof LinkedInIntegrationStatusSchema>;
