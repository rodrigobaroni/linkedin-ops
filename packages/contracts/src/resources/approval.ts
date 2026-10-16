import { z } from "zod";
import { ActorTypeSchema } from "../common/actor.js";
import { IsoDateTimeSchema } from "../common/datetime.js";
import { UuidSchema } from "../common/ids.js";
import { ApprovalDecisionSchema } from "../enums/approval.js";
import { AutonomyModeSchema } from "../enums/autonomy-mode.js";
import { AutonomySettingsSchema } from "./autonomy-settings.js";

/**
 * Immutable decision about one specific version. A SYSTEM approval must carry `reason` and
 * `policySnapshot` (briefing §13, data-model.md I5).
 */
export const ApprovalSchema = z
  .object({
    id: UuidSchema,
    draftId: UuidSchema,
    draftVersionId: UuidSchema,
    decision: ApprovalDecisionSchema,
    actorType: ActorTypeSchema,
    actorUserId: UuidSchema.nullable(),
    autonomyMode: AutonomyModeSchema.describe("Mode in force at decision time"),
    reason: z.string().max(1000).nullable(),
    policySnapshot: AutonomySettingsSchema.nullable(),
    createdAt: IsoDateTimeSchema,
  })
  .superRefine((approval, ctx) => {
    if (approval.actorType === "SYSTEM") {
      if (approval.reason === null) {
        ctx.addIssue({
          code: "custom",
          path: ["reason"],
          message: "SYSTEM decisions require a reason",
        });
      }
      if (approval.policySnapshot === null) {
        ctx.addIssue({
          code: "custom",
          path: ["policySnapshot"],
          message: "SYSTEM decisions require a policy snapshot",
        });
      }
    } else if (approval.actorUserId === null) {
      ctx.addIssue({
        code: "custom",
        path: ["actorUserId"],
        message: "USER decisions require actorUserId",
      });
    }
  })
  .meta({ id: "Approval" });
export type Approval = z.infer<typeof ApprovalSchema>;
