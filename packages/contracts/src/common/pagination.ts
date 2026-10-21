import { z } from "zod";

export const PAGINATION_DEFAULT_LIMIT = 20;
export const PAGINATION_MAX_LIMIT = 100;

/** Cursor pagination query (`?limit=20&cursor=<opaque>`). */
/** Strict: unknown query params are rejected (TM-06). `.extend()` keeps strictness. */
export const PaginationQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(PAGINATION_MAX_LIMIT).default(PAGINATION_DEFAULT_LIMIT),
  cursor: z.string().min(1).max(512).optional(),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
export type PaginationQueryInput = z.input<typeof PaginationQuerySchema>;

/**
 * Wraps an item schema in the standard page envelope `{ items, nextCursor }`. When the item is registered
 * with an id (`.meta({ id })`), the page gets `<Id>Page` so the OpenAPI document names it.
 */
export function paginated<T extends z.ZodType>(item: T) {
  const page = z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });
  const itemId = z.globalRegistry.get(item)?.id;
  return itemId === undefined ? page : page.meta({ id: `${itemId}Page` });
}
export type Page<T> = { items: T[]; nextCursor: string | null };
