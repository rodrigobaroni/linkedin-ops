import { z } from "zod";
import { IsoDateTimeSchema } from "../common/datetime.js";
import { UuidSchema } from "../common/ids.js";
import { PaginationQuerySchema } from "../common/pagination.js";

/** Keyword filter over collected items. It never monitors LinkedIn. */
export const WatchlistInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    keywords: z.array(z.string().trim().min(1).max(80)).min(1).max(50),
    pillarId: UuidSchema.nullable(),
    sourceIds: z.array(UuidSchema).max(100).describe("Empty = all active sources"),
  })
  .meta({ id: "WatchlistInput" });
export type WatchlistInput = z.infer<typeof WatchlistInputSchema>;

export const WatchlistPatchSchema = WatchlistInputSchema.partial()
  .extend({ isActive: z.boolean().optional() })
  .meta({ id: "WatchlistPatch" });
export type WatchlistPatch = z.infer<typeof WatchlistPatchSchema>;

export const WatchlistSchema = WatchlistInputSchema.extend({
  id: UuidSchema,
  isActive: z.boolean(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
}).meta({ id: "Watchlist" });
export type Watchlist = z.infer<typeof WatchlistSchema>;

export const WatchlistListQuerySchema = PaginationQuerySchema.extend({
  isActive: z.stringbool().optional(),
});
export type WatchlistListQuery = z.infer<typeof WatchlistListQuerySchema>;
