/**
 * Queue catalogue (contracts.md §6.1). api and worker import the same definitions; nobody enqueues a
 * payload that does not parse. Every payload carries `schemaVersion`, `correlationId`, `requestedBy`.
 */
import { z } from "zod";
import { RequestedBySchema } from "../common/actor.js";
import { CorrelationIdSchema, UuidSchema } from "../common/ids.js";

export const QueueNameSchema = z.enum([
  "source.fetch",
  "curation.run",
  "curation.expire",
  "draft.generate",
  "draft.regenerate",
  "media.render",
  "media.upload-linkedin",
  "publication.publish",
  "schedule.reconcile",
  "publication.reconcile",
  "notification.send",
  "linkedin.token-refresh",
  "cv.extract",
  "job.fetch",
  "cv.tailor",
  "retention.purge",
]);
export const QueueName = QueueNameSchema.enum;
export type QueueName = z.infer<typeof QueueNameSchema>;

/** pg-boss tables live in their own schema of the application database (ADR-0002 §1); api and worker share it. */
export const PGBOSS_SCHEMA_NAME = "pgboss";

/** Fields present in every job payload. Handlers accept version N-1 during deploys (contracts.md §5). */
export function jobEnvelope<V extends number>(schemaVersion: V) {
  return z.strictObject({
    schemaVersion: z.literal(schemaVersion),
    correlationId: CorrelationIdSchema,
    requestedBy: RequestedBySchema,
  });
}
export type JobEnvelope = z.infer<ReturnType<typeof jobEnvelope<number>>>;

/** Method-style signature so a specific payload type is assignable to `QueueDefinition<JobEnvelope>`. */
type SingletonKeyBuilder<P> = { build(payload: P): string }["build"];

export interface QueueDefinition<P extends JobEnvelope = JobEnvelope> {
  name: QueueName;
  /** Current payload version; bump on incompatible change. */
  schemaVersion: number;
  payload: z.ZodType<P>;
  /** pg-boss `retryLimit`. `0` = never retried automatically (publication, ADR-0003). */
  retryLimit: number;
  retryBackoff: boolean;
  retryDelaySeconds: number;
  expireInSeconds: number;
  /** Builds pg-boss `singletonKey`; `null` = no dedupe. */
  singletonKeyFrom: SingletonKeyBuilder<P> | null;
  deadLetter: string;
}

function defineQueue<P extends JobEnvelope>(definition: QueueDefinition<P>): QueueDefinition<P> {
  return definition;
}

const v1 = jobEnvelope(1);

export const SourceFetchPayloadSchema = v1.extend({ sourceId: UuidSchema, dryRun: z.boolean() });
export type SourceFetchPayload = z.infer<typeof SourceFetchPayloadSchema>;

export const CurationRunPayloadSchema = v1.extend({ curationRunId: UuidSchema });
export type CurationRunPayload = z.infer<typeof CurationRunPayloadSchema>;

export const CurationExpirePayloadSchema = v1.extend({ userId: UuidSchema });
export type CurationExpirePayload = z.infer<typeof CurationExpirePayloadSchema>;

export const DraftGeneratePayloadSchema = v1.extend({
  draftId: UuidSchema,
  opportunityId: UuidSchema,
});
export type DraftGeneratePayload = z.infer<typeof DraftGeneratePayloadSchema>;

export const DraftRegeneratePayloadSchema = v1.extend({
  draftId: UuidSchema,
  instructions: z.string().max(2000).nullable(),
  keepHooks: z.boolean(),
});
export type DraftRegeneratePayload = z.infer<typeof DraftRegeneratePayloadSchema>;

export const MediaRenderPayloadSchema = v1.extend({ mediaAssetId: UuidSchema });
export type MediaRenderPayload = z.infer<typeof MediaRenderPayloadSchema>;

export const MediaUploadLinkedInPayloadSchema = v1.extend({
  mediaAssetId: UuidSchema,
  publicationId: UuidSchema,
});
export type MediaUploadLinkedInPayload = z.infer<typeof MediaUploadLinkedInPayloadSchema>;

export const PublicationPublishPayloadSchema = v1.extend({ publicationId: UuidSchema });
export type PublicationPublishPayload = z.infer<typeof PublicationPublishPayloadSchema>;

export const ScheduleReconcilePayloadSchema = v1.extend({});
export type ScheduleReconcilePayload = z.infer<typeof ScheduleReconcilePayloadSchema>;

export const PublicationReconcilePayloadSchema = v1.extend({ publicationId: UuidSchema });
export type PublicationReconcilePayload = z.infer<typeof PublicationReconcilePayloadSchema>;

export const NotificationSendPayloadSchema = v1.extend({ notificationId: UuidSchema });
export type NotificationSendPayload = z.infer<typeof NotificationSendPayloadSchema>;

export const LinkedInTokenRefreshPayloadSchema = v1.extend({ userId: UuidSchema });
export type LinkedInTokenRefreshPayload = z.infer<typeof LinkedInTokenRefreshPayloadSchema>;

// Career module (spec 2026-10-22 §5). Payloads carry ids only: CV and job text never travel through the queue.

/** Structures the extracted text of a draft base CV (`cv_bases` row in status `extracting`). */
export const CvExtractPayloadSchema = v1.extend({ cvBaseId: UuidSchema });
export type CvExtractPayload = z.infer<typeof CvExtractPayloadSchema>;

/**
 * Processing cycle of a posting (`job_postings.attempt`, bumped by every reprocessing): a late job of an
 * earlier cycle finds the posting in a newer one and exits without effect.
 */
const PostingAttemptSchema = z.int().min(1);

/** Fetches (or reads pasted text of) one posting and runs `job-extract` (ADR-0008 limits apply). */
export const JobFetchPayloadSchema = v1.extend({
  jobPostingId: UuidSchema,
  attempt: PostingAttemptSchema,
});
export type JobFetchPayload = z.infer<typeof JobFetchPayloadSchema>;

/** Tailors the base CV to one extracted posting (`cv-tailor` → `cv-humanize`). */
export const CvTailorPayloadSchema = v1.extend({
  jobPostingId: UuidSchema,
  attempt: PostingAttemptSchema,
});
export type CvTailorPayload = z.infer<typeof CvTailorPayloadSchema>;

/**
 * Daily retention purge (T-063): no fields besides the envelope. A purge never takes a user or a row from its
 * payload; it applies the periods fixed in ADRs, specs and code to every row.
 */
export const RetentionPurgePayloadSchema = v1;
export type RetentionPurgePayload = z.infer<typeof RetentionPurgePayloadSchema>;

const deadLetterOf = (name: QueueName) => `${name}.dlq`;

export const QUEUES = {
  "source.fetch": defineQueue({
    name: "source.fetch",
    schemaVersion: 1,
    payload: SourceFetchPayloadSchema,
    retryLimit: 3,
    retryBackoff: true,
    retryDelaySeconds: 30,
    expireInSeconds: 300,
    singletonKeyFrom: (p) => p.sourceId,
    deadLetter: deadLetterOf("source.fetch"),
  }),
  "curation.run": defineQueue({
    name: "curation.run",
    schemaVersion: 1,
    payload: CurationRunPayloadSchema,
    retryLimit: 2,
    retryBackoff: false,
    retryDelaySeconds: 60,
    expireInSeconds: 1200,
    singletonKeyFrom: (p) => p.curationRunId,
    deadLetter: deadLetterOf("curation.run"),
  }),
  "curation.expire": defineQueue({
    name: "curation.expire",
    schemaVersion: 1,
    payload: CurationExpirePayloadSchema,
    retryLimit: 1,
    retryBackoff: false,
    retryDelaySeconds: 60,
    expireInSeconds: 300,
    singletonKeyFrom: (p) => p.userId,
    deadLetter: deadLetterOf("curation.expire"),
  }),
  "draft.generate": defineQueue({
    name: "draft.generate",
    schemaVersion: 1,
    payload: DraftGeneratePayloadSchema,
    retryLimit: 2,
    retryBackoff: true,
    retryDelaySeconds: 30,
    expireInSeconds: 600,
    singletonKeyFrom: (p) => p.draftId,
    deadLetter: deadLetterOf("draft.generate"),
  }),
  "draft.regenerate": defineQueue({
    name: "draft.regenerate",
    schemaVersion: 1,
    payload: DraftRegeneratePayloadSchema,
    retryLimit: 2,
    retryBackoff: true,
    retryDelaySeconds: 30,
    expireInSeconds: 600,
    singletonKeyFrom: (p) => p.draftId,
    deadLetter: deadLetterOf("draft.regenerate"),
  }),
  "media.render": defineQueue({
    name: "media.render",
    schemaVersion: 1,
    payload: MediaRenderPayloadSchema,
    retryLimit: 2,
    retryBackoff: false,
    retryDelaySeconds: 15,
    expireInSeconds: 300,
    singletonKeyFrom: (p) => p.mediaAssetId,
    deadLetter: deadLetterOf("media.render"),
  }),
  "media.upload-linkedin": defineQueue({
    name: "media.upload-linkedin",
    schemaVersion: 1,
    payload: MediaUploadLinkedInPayloadSchema,
    retryLimit: 3,
    retryBackoff: true,
    retryDelaySeconds: 30,
    expireInSeconds: 300,
    singletonKeyFrom: (p) => p.mediaAssetId,
    deadLetter: deadLetterOf("media.upload-linkedin"),
  }),
  "publication.publish": defineQueue({
    name: "publication.publish",
    schemaVersion: 1,
    payload: PublicationPublishPayloadSchema,
    retryLimit: 0,
    retryBackoff: false,
    retryDelaySeconds: 0,
    expireInSeconds: 300,
    singletonKeyFrom: (p) => p.publicationId,
    deadLetter: deadLetterOf("publication.publish"),
  }),
  "schedule.reconcile": defineQueue({
    name: "schedule.reconcile",
    schemaVersion: 1,
    payload: ScheduleReconcilePayloadSchema,
    retryLimit: 1,
    retryBackoff: false,
    retryDelaySeconds: 30,
    expireInSeconds: 120,
    singletonKeyFrom: () => "schedule.reconcile",
    deadLetter: deadLetterOf("schedule.reconcile"),
  }),
  "publication.reconcile": defineQueue({
    name: "publication.reconcile",
    schemaVersion: 1,
    payload: PublicationReconcilePayloadSchema,
    retryLimit: 3,
    retryBackoff: true,
    retryDelaySeconds: 60,
    expireInSeconds: 300,
    singletonKeyFrom: (p) => p.publicationId,
    deadLetter: deadLetterOf("publication.reconcile"),
  }),
  "notification.send": defineQueue({
    name: "notification.send",
    schemaVersion: 1,
    payload: NotificationSendPayloadSchema,
    retryLimit: 5,
    retryBackoff: true,
    retryDelaySeconds: 15,
    expireInSeconds: 60,
    singletonKeyFrom: (p) => p.notificationId,
    deadLetter: deadLetterOf("notification.send"),
  }),
  "linkedin.token-refresh": defineQueue({
    name: "linkedin.token-refresh",
    schemaVersion: 1,
    payload: LinkedInTokenRefreshPayloadSchema,
    retryLimit: 3,
    retryBackoff: true,
    retryDelaySeconds: 60,
    expireInSeconds: 120,
    singletonKeyFrom: (p) => p.userId,
    deadLetter: deadLetterOf("linkedin.token-refresh"),
  }),
  "cv.extract": defineQueue({
    name: "cv.extract",
    schemaVersion: 1,
    payload: CvExtractPayloadSchema,
    retryLimit: 2,
    retryBackoff: true,
    retryDelaySeconds: 30,
    expireInSeconds: 600,
    singletonKeyFrom: (p) => p.cvBaseId,
    deadLetter: deadLetterOf("cv.extract"),
  }),
  // ADR-0008 §4: one retry, at least 60 s later, network/5xx only; stop signals are permanent failures.
  "job.fetch": defineQueue({
    name: "job.fetch",
    schemaVersion: 1,
    payload: JobFetchPayloadSchema,
    retryLimit: 1,
    retryBackoff: false,
    retryDelaySeconds: 60,
    expireInSeconds: 300,
    singletonKeyFrom: (p) => p.jobPostingId,
    deadLetter: deadLetterOf("job.fetch"),
  }),
  "cv.tailor": defineQueue({
    name: "cv.tailor",
    schemaVersion: 1,
    payload: CvTailorPayloadSchema,
    retryLimit: 2,
    retryBackoff: true,
    retryDelaySeconds: 30,
    expireInSeconds: 900,
    singletonKeyFrom: (p) => p.jobPostingId,
    deadLetter: deadLetterOf("cv.tailor"),
  }),
  // T-063: once a day; idempotent, so a retry or a missed run only purges later.
  "retention.purge": defineQueue({
    name: "retention.purge",
    schemaVersion: 1,
    payload: RetentionPurgePayloadSchema,
    retryLimit: 1,
    retryBackoff: true,
    retryDelaySeconds: 300,
    expireInSeconds: 900,
    singletonKeyFrom: null,
    deadLetter: deadLetterOf("retention.purge"),
  }),
} as const satisfies Record<QueueName, QueueDefinition<JobEnvelope>>;

export type Queues = typeof QUEUES;
export type QueuePayload<N extends QueueName> = z.infer<Queues[N]["payload"]>;
