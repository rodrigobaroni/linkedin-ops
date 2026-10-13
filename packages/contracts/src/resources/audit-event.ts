import { z } from "zod";
import { AuditActorTypeSchema } from "../common/actor.js";
import { IsoDateTimeSchema } from "../common/datetime.js";
import { CorrelationIdSchema, UuidSchema } from "../common/ids.js";
import { PaginationQuerySchema } from "../common/pagination.js";

/** Dotted action name (`draft.approve`, `settings.autonomy.update`, `oauth.connect`). */
export const AuditActionSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)+$/, "Expected a dotted action name like draft.approve")
  .max(100);
export type AuditAction = z.infer<typeof AuditActionSchema>;

/** Redacted diff: never tokens, never full prompt content. */
export const AuditSnapshotSchema = z.record(z.string(), z.unknown());

/** Append-only audit record (data-model.md §2.7). */
export const AuditEventSchema = z
  .object({
    id: UuidSchema,
    actorType: AuditActorTypeSchema,
    actorId: z.string().max(128).nullable().describe("User id or job name"),
    action: AuditActionSchema,
    entityType: z.string().min(1).max(64),
    entityId: UuidSchema.nullable(),
    before: AuditSnapshotSchema.nullable(),
    after: AuditSnapshotSchema.nullable(),
    correlationId: CorrelationIdSchema,
    ip: z.string().max(45).nullable(),
    userAgent: z.string().max(512).nullable(),
    createdAt: IsoDateTimeSchema,
  })
  .meta({ id: "AuditEvent" });
export type AuditEvent = z.infer<typeof AuditEventSchema>;

export const AuditEventQuerySchema = PaginationQuerySchema.extend({
  entityType: z.string().max(64).optional(),
  entityId: UuidSchema.optional(),
  from: IsoDateTimeSchema.optional(),
  to: IsoDateTimeSchema.optional(),
});
export type AuditEventQuery = z.infer<typeof AuditEventQuerySchema>;
