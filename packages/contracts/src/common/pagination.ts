import { z } from "zod";

export const PAGINATION_DEFAULT_LIMIT = 20;
export const PAGINATION_MAX_LIMIT = 100;

/** Cursor pagination query (`?limit=20&cursor=<opaque>`). */
export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(PAGINATION_MAX_LIMIT).default(PAGINATION_DEFAULT_LIMIT),
  cursor: z.string().min(1).max(512).optional(),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
export type PaginationQueryInput = z.input<typeof PaginationQuerySchema>;

/** Wraps an item schema in the standard page envelope `{ items, nextCursor }`. */
export function paginated<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });
}
export type Page<T> = { items: T[]; nextCursor: string | null };
