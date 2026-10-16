import { z } from "zod";
import { UuidSchema } from "./ids.js";

/** Body of a `202 Accepted` response for actions that enqueue a job (contracts.md §1). */
export const AsyncAcceptedSchema = z
  .object({
    id: UuidSchema.describe("Id of the resource the job acts on"),
    status: z.string().min(1).describe("Current status of that resource"),
    jobId: z.string().min(1).describe("pg-boss job id"),
  })
  .meta({ id: "AsyncAccepted" });
export type AsyncAccepted = z.infer<typeof AsyncAcceptedSchema>;

/** Classified, secret-free error stored on runs, drafts and publications. */
export const ClassifiedErrorSchema = z
  .object({
    code: z.string().min(1).max(64).describe("Stable machine-readable code"),
    message: z.string().max(2000).describe("Human-readable message, redacted"),
    retryable: z.boolean().describe("Whether a retry may succeed"),
  })
  .meta({ id: "ClassifiedError" });
export type ClassifiedError = z.infer<typeof ClassifiedErrorSchema>;
