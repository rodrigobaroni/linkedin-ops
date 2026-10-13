import { z } from "zod";
import { IsoDateTimeSchema } from "../common/datetime.js";
import { HttpsUrlSchema, UuidSchema } from "../common/ids.js";
import { PaginationQuerySchema } from "../common/pagination.js";
import { SourceFetchStatusSchema, SourceTypeSchema, TrustLevelSchema } from "../enums/source.js";

export const SOURCE_MIN_FETCH_INTERVAL_MINUTES = 60;

const sourceShape = {
  type: SourceTypeSchema,
  name: z.string().trim().min(1).max(120),
  url: HttpsUrlSchema,
  trustLevel: TrustLevelSchema,
  pillarHints: z.array(UuidSchema).max(20),
  fetchIntervalMinutes: z.int().min(SOURCE_MIN_FETCH_INTERVAL_MINUTES).max(10080),
};

/**
 * `POST /sources` body. The URL must be https; host allowlist and private-IP rejection are enforced by
 * the API (they need DNS), not by this schema.
 */
export const SourceInputSchema = z.strictObject(sourceShape).meta({ id: "SourceInput" });
export type SourceInput = z.infer<typeof SourceInputSchema>;

export const SourcePatchSchema = SourceInputSchema.partial()
  .extend({ isActive: z.boolean().optional() })
  .meta({ id: "SourcePatch" });
export type SourcePatch = z.infer<typeof SourcePatchSchema>;

export const SourceSchema = z
  .object({
    ...sourceShape,
    id: UuidSchema,
    isActive: z.boolean(),
    lastFetchedAt: IsoDateTimeSchema.nullable(),
    lastStatus: SourceFetchStatusSchema.nullable(),
    lastError: z.string().max(1000).nullable().describe("Classified, secret-free"),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .meta({ id: "Source" });
export type Source = z.infer<typeof SourceSchema>;

export const SourceListQuerySchema = PaginationQuerySchema.extend({
  type: SourceTypeSchema.optional(),
  isActive: z.stringbool().optional(),
});
export type SourceListQuery = z.infer<typeof SourceListQuerySchema>;
