import { z } from "zod";
import { IsoDateTimeSchema } from "../common/datetime.js";
import { SlugSchema, UuidSchema } from "../common/ids.js";
import { PaginationQuerySchema } from "../common/pagination.js";

/** `POST /content-pillars` body. */
export const ContentPillarInputSchema = z
  .object({
    slug: SlugSchema,
    name: z.string().trim().min(1).max(80),
    description: z.string().max(1000).nullable(),
    targetAudience: z.string().max(500).nullable(),
    weight: z.number().min(0).max(10).describe("Ranking priority"),
    isActive: z.boolean(),
  })
  .meta({ id: "ContentPillarInput" });
export type ContentPillarInput = z.infer<typeof ContentPillarInputSchema>;

export const ContentPillarPatchSchema = ContentPillarInputSchema.partial().meta({
  id: "ContentPillarPatch",
});
export type ContentPillarPatch = z.infer<typeof ContentPillarPatchSchema>;

export const ContentPillarSchema = ContentPillarInputSchema.extend({
  id: UuidSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
}).meta({ id: "ContentPillar" });
export type ContentPillar = z.infer<typeof ContentPillarSchema>;

export const ContentPillarListQuerySchema = PaginationQuerySchema.extend({
  isActive: z.stringbool().optional(),
});
export type ContentPillarListQuery = z.infer<typeof ContentPillarListQuerySchema>;
