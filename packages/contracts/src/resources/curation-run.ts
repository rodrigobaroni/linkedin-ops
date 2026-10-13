import { z } from "zod";
import { ClassifiedErrorSchema } from "../common/async.js";
import { IanaTimezoneSchema, IsoDateTimeSchema } from "../common/datetime.js";
import { SemverSchema, UuidSchema } from "../common/ids.js";
import { PaginationQuerySchema } from "../common/pagination.js";
import { CurationRunStatusSchema, CurationRunTriggerSchema } from "../enums/curation-run.js";
import { OPPORTUNITIES_PER_RUN, OpportunitySchema } from "./opportunity.js";

const Count = z.int().min(0);

export const CurationRunStatsSchema = z
  .object({
    sourcesFetched: Count,
    itemsNew: Count,
    itemsDeduped: Count,
    candidatesScored: Count,
    injectionSuspected: Count.describe(
      "Candidates flagged by the model as possible prompt injection (ADR-0005 §9)",
    ),
  })
  .meta({ id: "CurationRunStats" });
export type CurationRunStats = z.infer<typeof CurationRunStatsSchema>;

export const CurationRunSchema = z
  .object({
    id: UuidSchema,
    scheduledFor: IsoDateTimeSchema,
    timezone: IanaTimezoneSchema,
    trigger: CurationRunTriggerSchema,
    status: CurationRunStatusSchema,
    startedAt: IsoDateTimeSchema.nullable(),
    finishedAt: IsoDateTimeSchema.nullable(),
    stats: CurationRunStatsSchema.nullable(),
    engineVersion: SemverSchema.nullable(),
    promptId: z.string().max(64).nullable(),
    promptVersion: SemverSchema.nullable(),
    model: z.string().max(64).nullable(),
    error: ClassifiedErrorSchema.nullable(),
    jobId: z.string().max(128).nullable(),
    createdAt: IsoDateTimeSchema,
  })
  .meta({ id: "CurationRun" });
export type CurationRun = z.infer<typeof CurationRunSchema>;

/** `GET /curation-runs/{id}`: run plus its (up to five) cards. */
export const CurationRunDetailSchema = CurationRunSchema.extend({
  opportunities: z.array(OpportunitySchema).max(OPPORTUNITIES_PER_RUN),
}).meta({ id: "CurationRunDetail" });
export type CurationRunDetail = z.infer<typeof CurationRunDetailSchema>;

export const CurationRunListQuerySchema = PaginationQuerySchema.extend({
  status: CurationRunStatusSchema.optional(),
});
export type CurationRunListQuery = z.infer<typeof CurationRunListQuerySchema>;
