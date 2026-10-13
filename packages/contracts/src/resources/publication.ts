import { z } from "zod";
import { IsoDateTimeSchema } from "../common/datetime.js";
import { LinkedInUrnSchema, UuidSchema } from "../common/ids.js";
import { PaginationQuerySchema } from "../common/pagination.js";
import { PublicationStatusSchema } from "../enums/publication.js";

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
    draftId: UuidSchema,
    draftVersionId: UuidSchema,
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

export const PublicationListQuerySchema = PaginationQuerySchema.extend({
  status: PublicationStatusSchema.optional(),
  draftId: UuidSchema.optional(),
});
export type PublicationListQuery = z.infer<typeof PublicationListQuerySchema>;
