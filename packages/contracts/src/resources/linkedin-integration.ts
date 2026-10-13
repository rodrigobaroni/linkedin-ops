import { z } from "zod";
import { IsoDateTimeSchema } from "../common/datetime.js";
import { HttpsUrlSchema, LinkedInUrnSchema } from "../common/ids.js";
import { LinkedInIntegrationStatusSchema } from "../enums/linkedin-integration-status.js";

/** `GET /integrations/linkedin`. Tokens are never part of this DTO (ADR-0004). */
export const LinkedInIntegrationSchema = z
  .object({
    status: LinkedInIntegrationStatusSchema,
    scopes: z.array(z.string().min(1).max(64)).describe("Granted OAuth scopes"),
    accessExpiresAt: IsoDateTimeSchema.nullable(),
    memberUrn: LinkedInUrnSchema.nullable(),
  })
  .meta({ id: "LinkedInIntegration" });
export type LinkedInIntegration = z.infer<typeof LinkedInIntegrationSchema>;

/** `POST /integrations/linkedin/connect` response. */
export const LinkedInConnectResponseSchema = z
  .object({
    authorizeUrl: HttpsUrlSchema.describe("LinkedIn authorization URL to redirect the browser to"),
  })
  .meta({ id: "LinkedInConnectResponse" });
export type LinkedInConnectResponse = z.infer<typeof LinkedInConnectResponseSchema>;

/**
 * Query of `GET /integrations/linkedin/callback` (RFC 6749 §4.1.2 / §4.1.2.1): exactly one of `code` or
 * `error`, never both, never neither. `code` is exchanged server-side and never stored. Unknown params are
 * rejected (TM-03).
 */
export const LinkedInCallbackQuerySchema = z
  .strictObject({
    state: z.string().min(1).max(512),
    code: z.string().min(1).max(2048).optional(),
    error: z.string().min(1).max(128).optional(),
    error_description: z.string().max(1024).optional(),
  })
  .refine((query) => (query.code !== undefined) !== (query.error !== undefined), {
    message: "Exactly one of code or error must be present",
    path: ["code"],
  })
  .meta({ id: "LinkedInCallbackQuery" });
export type LinkedInCallbackQuery = z.infer<typeof LinkedInCallbackQuerySchema>;
