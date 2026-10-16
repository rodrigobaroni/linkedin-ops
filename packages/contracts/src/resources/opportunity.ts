import { z } from "zod";
import { AsyncAcceptedSchema } from "../common/async.js";
import { IsoDateTimeSchema } from "../common/datetime.js";
import { HttpsUrlSchema, SlugSchema, UuidSchema } from "../common/ids.js";
import { PaginationQuerySchema } from "../common/pagination.js";
import { CurationRunStatusSchema, type CurationRunStatus } from "../enums/curation-run.js";
import {
  OpportunityOriginSchema,
  OpportunityStatusSchema,
  SuggestedFormatSchema,
} from "../enums/opportunity.js";
import { SourceItemSummarySchema } from "./source-item.js";

const Unit = z.number().min(0).max(1);

/**
 * Ranking components, each 0–1. `voiceFit` = Rodrigo has first-hand material (Story Bank) for the topic;
 * `risk` = controversy / factual uncertainty (lower is better). Both added 2026-10-13 (Atlas ⇄ Pena).
 */
export const ScoreBreakdownSchema = z
  .object({
    recency: Unit,
    pillarFit: Unit,
    audienceFit: Unit,
    novelty: Unit,
    sourceTrust: Unit,
    voiceFit: Unit,
    risk: Unit,
  })
  .meta({ id: "ScoreBreakdown" });
export type ScoreBreakdown = z.infer<typeof ScoreBreakdownSchema>;

/**
 * Editorial opportunity: the briefing §13 contract verbatim (same names, lowercase enums) plus optional
 * internal fields (contracts.md §3.1).
 */
export const OpportunitySchema = z
  .object({
    id: UuidSchema,
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().min(1).max(2000),
    sourceIds: z.array(UuidSchema).describe("Ids of SourceItem"),
    publishedAt: IsoDateTimeSchema.nullable(),
    contentPillar: SlugSchema.describe("ContentPillar slug"),
    targetAudience: z.string().trim().min(1).max(300),
    relevanceReason: z.string().trim().min(1).max(1000),
    suggestedAngle: z.string().trim().min(1).max(1000),
    suggestedFormat: SuggestedFormatSchema,
    score: z.number().min(0).max(100),
    status: OpportunityStatusSchema,
    // internal, optional in the DTO
    rank: z.int().min(1).max(5).nullable().optional().describe("1–5 within the run"),
    curationRunId: UuidSchema.nullable().optional().describe("null when origin = MANUAL"),
    origin: OpportunityOriginSchema.optional(),
    scoreBreakdown: ScoreBreakdownSchema.optional(),
    expiresAt: IsoDateTimeSchema.nullable().optional(),
    draftId: UuidSchema.nullable().optional(),
    selectedAt: IsoDateTimeSchema.nullable().optional(),
    dismissedAt: IsoDateTimeSchema.nullable().optional(),
    dismissReason: z.string().max(500).nullable().optional(),
  })
  .meta({ id: "Opportunity" });
export type Opportunity = z.infer<typeof OpportunitySchema>;

/** `GET /opportunities/{id}`. */
export const OpportunityDetailSchema = OpportunitySchema.extend({
  sourceItems: z.array(SourceItemSummarySchema),
}).meta({ id: "OpportunityDetail" });
export type OpportunityDetail = z.infer<typeof OpportunityDetailSchema>;

export const OPPORTUNITIES_PER_RUN = 5;

/**
 * Invariant I1 (data-model.md §2.4, §4): a `SUCCEEDED` run has exactly five opportunities with distinct
 * ranks 1..5 and distinct ids. Other run statuses (`PARTIAL`, `FAILED`, …) may carry fewer cards, but ranks,
 * when present, are still distinct. The service enforces it on write; the DTO refuses to carry a violation.
 */
export function refineRunOpportunities(
  status: CurationRunStatus,
  opportunities: readonly Opportunity[],
  ctx: z.RefinementCtx,
  path: readonly (string | number)[] = ["opportunities"],
): void {
  const ids = opportunities.map((opportunity) => opportunity.id);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({
      code: "custom",
      path: [...path],
      message: "Opportunity ids must be distinct within a run",
    });
  }
  const presentRanks = opportunities
    .map((opportunity) => opportunity.rank ?? null)
    .filter((rank): rank is number => rank !== null);
  if (new Set(presentRanks).size !== presentRanks.length) {
    ctx.addIssue({
      code: "custom",
      path: [...path],
      message: "Opportunity ranks must be distinct within a run",
    });
  }
  if (status !== "SUCCEEDED") return;
  if (opportunities.length !== OPPORTUNITIES_PER_RUN) {
    ctx.addIssue({
      code: "custom",
      path: [...path],
      message: `A SUCCEEDED run has exactly ${OPPORTUNITIES_PER_RUN} opportunities (I1)`,
    });
    return;
  }
  const sorted = [...presentRanks].sort((a, b) => a - b);
  const isOneToFive =
    sorted.length === OPPORTUNITIES_PER_RUN && sorted.every((rank, index) => rank === index + 1);
  if (!isOneToFive) {
    ctx.addIssue({
      code: "custom",
      path: [...path],
      message: "A SUCCEEDED run ranks its opportunities 1..5 without gaps or repeats (I1)",
    });
  }
}

/** The cards of one curation run. `status` is the run status, so I1 applies when it is `SUCCEEDED`. */
export const OpportunityBatchSchema = z
  .object({
    curationRunId: UuidSchema,
    status: CurationRunStatusSchema,
    generatedAt: IsoDateTimeSchema,
    opportunities: z.array(OpportunitySchema).max(OPPORTUNITIES_PER_RUN),
  })
  .superRefine((batch, ctx) => refineRunOpportunities(batch.status, batch.opportunities, ctx))
  .meta({ id: "OpportunityBatch" });
export type OpportunityBatch = z.infer<typeof OpportunityBatchSchema>;

export const OpportunityListQuerySchema = PaginationQuerySchema.extend({
  runId: UuidSchema.optional(),
  status: OpportunityStatusSchema.optional(),
  pillar: SlugSchema.optional(),
});
export type OpportunityListQuery = z.infer<typeof OpportunityListQuerySchema>;

/** `POST /opportunities/{id}/dismiss` body. */
export const OpportunityDismissInputSchema = z
  .strictObject({
    reason: z.string().trim().max(500).optional(),
  })
  .meta({ id: "OpportunityDismissInput" });
export type OpportunityDismissInput = z.infer<typeof OpportunityDismissInputSchema>;

/** `202` from `POST /opportunities/{id}/select`: a new draft is being generated (`id` = draft id). */
export const OpportunitySelectAcceptedSchema = AsyncAcceptedSchema.extend({
  draftId: UuidSchema,
}).meta({ id: "OpportunitySelectAccepted" });
export type OpportunitySelectAccepted = z.infer<typeof OpportunitySelectAcceptedSchema>;

/** `200` from `POST /opportunities/{id}/select`: an existing prefetched draft was adopted, no new job. */
export const OpportunitySelectAdoptedSchema = z
  .object({
    draftId: UuidSchema,
  })
  .meta({ id: "OpportunitySelectAdopted" });
export type OpportunitySelectAdopted = z.infer<typeof OpportunitySelectAdoptedSchema>;

/** `POST /opportunities/manual` body: a topic typed by Rodrigo. */
export const ManualOpportunityInputSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().max(2000).optional(),
    contentPillar: SlugSchema,
    suggestedFormat: SuggestedFormatSchema.optional(),
    sourceUrls: z.array(HttpsUrlSchema).max(10).optional(),
  })
  .meta({ id: "ManualOpportunityInput" });
export type ManualOpportunityInput = z.infer<typeof ManualOpportunityInputSchema>;

/** `202` from `POST /opportunities/manual` (`id` = opportunity id). */
export const ManualOpportunityAcceptedSchema = AsyncAcceptedSchema.extend({
  opportunityId: UuidSchema,
  draftId: UuidSchema,
}).meta({ id: "ManualOpportunityAccepted" });
export type ManualOpportunityAccepted = z.infer<typeof ManualOpportunityAcceptedSchema>;
