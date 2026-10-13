import { z } from "zod";
import { IsoDateTimeSchema } from "../common/datetime.js";
import { HttpsUrlSchema, UuidSchema } from "../common/ids.js";
import { PaginationQuerySchema } from "../common/pagination.js";
import { StoryBankEntryStatusSchema } from "../enums/story-bank-status.js";

/** A verifiable fact inside a story, with its source when it has one. */
export const StoryFactSchema = z
  .strictObject({
    claim: z.string().trim().min(1).max(500),
    value: z.string().max(200).nullable().describe("Number/date/entity as stated"),
    sourceUrl: HttpsUrlSchema.nullable(),
    verifiedAt: IsoDateTimeSchema.nullable(),
  })
  .meta({ id: "StoryFact" });
export type StoryFact = z.infer<typeof StoryFactSchema>;

export const StoryTagSchema = z.string().trim().min(1).max(40);

const storyBankEntryShape = {
  title: z.string().trim().min(1).max(200),
  narrative: z.string().min(1).max(5000),
  context: z.string().max(2000).nullable(),
  lesson: z.string().max(1000).nullable(),
  facts: z.array(StoryFactSchema).max(50),
  tags: z.array(StoryTagSchema).max(20),
  pillarIds: z.array(UuidSchema).max(20),
};

/** `POST /story-bank` body. Narratives are written by Rodrigo in the first person; the system never creates entries. */
export const StoryBankEntryInputSchema = z
  .strictObject(storyBankEntryShape)
  .meta({ id: "StoryBankEntryInput" });
export type StoryBankEntryInput = z.infer<typeof StoryBankEntryInputSchema>;

/** `PATCH /story-bank/{id}` body. */
export const StoryBankEntryPatchSchema = StoryBankEntryInputSchema.partial()
  .extend({ status: StoryBankEntryStatusSchema.optional() })
  .meta({ id: "StoryBankEntryPatch" });
export type StoryBankEntryPatch = z.infer<typeof StoryBankEntryPatchSchema>;

export const StoryBankEntrySchema = z
  .object({
    ...storyBankEntryShape,
    id: UuidSchema,
    status: StoryBankEntryStatusSchema,
    usageCount: z.int().min(0),
    lastUsedAt: IsoDateTimeSchema.nullable(),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .meta({ id: "StoryBankEntry" });
export type StoryBankEntry = z.infer<typeof StoryBankEntrySchema>;

export const StoryBankListQuerySchema = PaginationQuerySchema.extend({
  tag: StoryTagSchema.optional(),
  pillarId: UuidSchema.optional(),
  status: StoryBankEntryStatusSchema.optional(),
});
export type StoryBankListQuery = z.infer<typeof StoryBankListQuerySchema>;
