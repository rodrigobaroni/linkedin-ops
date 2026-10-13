import { z } from "zod";
import { IsoDateTimeSchema } from "../common/datetime.js";
import { UuidSchema } from "../common/ids.js";

export const SOURCE_ITEM_MAX_CONTENT_CHARS = 50_000;

export const Sha256HexSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "Expected a lowercase sha256 hex digest");

/**
 * Collected external content. Always untrusted: it never becomes an instruction for the system or the
 * model (briefing §2, ADR-0005 §4). `untrusted: true` is a constant to remind every consumer.
 */
export const SourceItemSchema = z
  .object({
    id: UuidSchema,
    sourceId: UuidSchema,
    externalId: z.string().min(1).max(512).describe("Feed guid or URL hash"),
    canonicalUrl: z.url().max(2048).describe("Normalized URL (no tracking params, no fragment)"),
    title: z.string().max(500).describe("Sanitized plain text"),
    author: z.string().max(200).nullable(),
    contentText: z
      .string()
      .max(SOURCE_ITEM_MAX_CONTENT_CHARS)
      .describe("Plain text; raw HTML is never stored"),
    contentHash: Sha256HexSchema,
    language: z.string().max(16).nullable(),
    publishedAt: IsoDateTimeSchema.nullable(),
    fetchedAt: IsoDateTimeSchema,
    untrusted: z.literal(true),
  })
  .meta({ id: "SourceItem" });
export type SourceItem = z.infer<typeof SourceItemSchema>;

/** Compact form embedded in `OpportunityDetail.sourceItems`. */
export const SourceItemSummarySchema = SourceItemSchema.pick({
  id: true,
  sourceId: true,
  canonicalUrl: true,
  title: true,
  author: true,
  publishedAt: true,
  untrusted: true,
}).meta({ id: "SourceItemSummary" });
export type SourceItemSummary = z.infer<typeof SourceItemSummarySchema>;
