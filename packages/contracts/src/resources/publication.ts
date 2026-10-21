import { z } from "zod";
import { IsoDateTimeSchema } from "../common/datetime.js";
import { LinkedInUrnSchema, UuidSchema } from "../common/ids.js";
import { PaginationQuerySchema } from "../common/pagination.js";
import { PublicationStatusSchema } from "../enums/publication.js";

/** Upper bound of a LinkedIn post `commentary`. */
export const LINKEDIN_POST_TEXT_MAX_LENGTH = 3000;

/** Error returned by LinkedIn or raised before the call; never contains the token. */
export const PublicationErrorSchema = z
  .object({
    code: z.string().min(1).max(64),
    httpStatus: z.int().min(100).max(599).nullable(),
    message: z.string().max(2000),
  })
  .meta({ id: "PublicationError" });
export type PublicationError = z.infer<typeof PublicationErrorSchema>;

/** One attempt to publish a version (ADR-0003). */
export const PublicationSchema = z
  .object({
    id: UuidSchema,
    draftId: UuidSchema.nullable().describe("null = manual text published now (no draft)"),
    draftVersionId: UuidSchema.nullable(),
    text: z
      .string()
      .max(LINKEDIN_POST_TEXT_MAX_LENGTH)
      .nullable()
      .describe("Exact text of a manual publication; null when published from a draft version"),
    scheduleId: UuidSchema.nullable().describe("null = publish now"),
    status: PublicationStatusSchema,
    attempt: z.int().min(0),
    externalPostId: LinkedInUrnSchema.nullable(),
    externalUrl: z.url().max(2048).nullable(),
    startedAt: IsoDateTimeSchema.nullable(),
    finishedAt: IsoDateTimeSchema.nullable(),
    publishedAt: IsoDateTimeSchema.nullable(),
    error: PublicationErrorSchema.nullable(),
    createdAt: IsoDateTimeSchema,
  })
  .meta({ id: "Publication" });
export type Publication = z.infer<typeof PublicationSchema>;

/**
 * `POST /publications/publish-now` (MVP-0): free text written by the owner, published synchronously. The text
 * is sent as-is (escaped for LinkedIn little-text); `Idempotency-Key` makes a double click a replay.
 */
export const PublishNowInputSchema = z
  .strictObject({
    text: z
      .string()
      .min(1)
      .max(LINKEDIN_POST_TEXT_MAX_LENGTH)
      .refine((text) => text.trim().length > 0, { message: "Text must not be blank" }),
  })
  .meta({ id: "PublishNowInput" });
export type PublishNowInput = z.infer<typeof PublishNowInputSchema>;

export const PublicationListQuerySchema = PaginationQuerySchema.extend({
  status: PublicationStatusSchema.optional(),
  draftId: UuidSchema.optional(),
});
export type PublicationListQuery = z.infer<typeof PublicationListQuerySchema>;
