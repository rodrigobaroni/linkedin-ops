import { z } from "zod";

/** Who decided or requested something inside the editorial pipeline. */
export const ActorTypeSchema = z.enum(["USER", "SYSTEM"]).meta({ id: "ActorType" });
export const ActorType = ActorTypeSchema.enum;
export type ActorType = z.infer<typeof ActorTypeSchema>;

/** Audit actor: adds WORKER for job handlers acting on their own schedule. */
export const AuditActorTypeSchema = z
  .enum(["USER", "SYSTEM", "WORKER"])
  .meta({ id: "AuditActorType" });
export const AuditActorType = AuditActorTypeSchema.enum;
export type AuditActorType = z.infer<typeof AuditActorTypeSchema>;

/** Carried by every job payload (contracts.md §6.1). */
export const RequestedBySchema = z
  .object({
    type: ActorTypeSchema,
    id: z.string().min(1).max(128).describe("User id, or system component name"),
  })
  .meta({ id: "RequestedBy" });
export type RequestedBy = z.infer<typeof RequestedBySchema>;
