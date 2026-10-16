import { QUEUES, type QueueName } from "../../src/index.js";
import { drop, set, type SchemaCase } from "../helpers.js";
import { ids } from "./ids.js";

const envelope = {
  schemaVersion: 1,
  correlationId: "req_01JABCDEF",
  requestedBy: { type: "USER", id: ids.user },
} as const;

export const jobPayloads: Record<QueueName, Record<string, unknown>> = {
  "source.fetch": { ...envelope, sourceId: ids.source, dryRun: true },
  "curation.run": { ...envelope, curationRunId: ids.run },
  "curation.expire": { ...envelope, requestedBy: { type: "SYSTEM", id: "cron" }, userId: ids.user },
  "draft.generate": { ...envelope, draftId: ids.draft, opportunityId: ids.opportunity },
  "draft.regenerate": {
    ...envelope,
    draftId: ids.draft,
    instructions: "Mais curto",
    keepHooks: false,
  },
  "media.render": { ...envelope, mediaAssetId: ids.media },
  "media.upload-linkedin": { ...envelope, mediaAssetId: ids.media, publicationId: ids.publication },
  "publication.publish": { ...envelope, publicationId: ids.publication },
  "schedule.reconcile": { ...envelope, requestedBy: { type: "SYSTEM", id: "cron" } },
  "publication.reconcile": { ...envelope, publicationId: ids.publication },
  "notification.send": { ...envelope, notificationId: ids.notification },
  "linkedin.token-refresh": {
    ...envelope,
    requestedBy: { type: "SYSTEM", id: "cron" },
    userId: ids.user,
  },
};

const specificInvalid: Partial<Record<QueueName, Record<string, (v: unknown) => unknown>>> = {
  "source.fetch": {
    "dryRun as string": set("dryRun", "yes"),
    "bad sourceId": set("sourceId", "src-1"),
  },
  "curation.run": { "missing curationRunId": drop("curationRunId") },
  "curation.expire": { "missing userId": drop("userId") },
  "draft.generate": { "missing opportunityId": drop("opportunityId") },
  "draft.regenerate": {
    "instructions undefined": drop("instructions"),
    "keepHooks missing": drop("keepHooks"),
  },
  "media.render": { "bad mediaAssetId": set("mediaAssetId", 42) },
  "media.upload-linkedin": { "missing publicationId": drop("publicationId") },
  "publication.publish": { "missing publicationId": drop("publicationId") },
  "schedule.reconcile": { "requestedBy WORKER": set("requestedBy.type", "WORKER") },
  "publication.reconcile": { "bad publicationId": set("publicationId", "pub") },
  "notification.send": { "bad notificationId": set("notificationId", "") },
  "linkedin.token-refresh": { "bad userId": set("userId", null) },
};

export const jobCases: SchemaCase[] = (Object.keys(QUEUES) as QueueName[]).map((name) => ({
  name: `job:${name}`,
  schema: QUEUES[name].payload,
  valid: jobPayloads[name],
  invalid: {
    "schemaVersion 2": set("schemaVersion", 2),
    "missing correlationId": drop("correlationId"),
    "requestedBy without id": drop("requestedBy.id"),
    ...specificInvalid[name],
  },
}));
