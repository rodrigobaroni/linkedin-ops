import { z } from "zod";

/** `GET /health` liveness. */
export const HealthStatusSchema = z
  .object({
    status: z.literal("ok"),
    version: z.string().optional().describe("Application version"),
    uptimeSeconds: z.int().min(0).optional(),
  })
  .meta({ id: "HealthStatus" });
export type HealthStatus = z.infer<typeof HealthStatusSchema>;

/** `skipped`: the dependency is not wired yet (e.g. pg-boss before T-006); never counts as a failure. */
export const ReadinessCheckSchema = z
  .enum(["ok", "failed", "skipped"])
  .meta({ id: "ReadinessCheck" });
export type ReadinessCheck = z.infer<typeof ReadinessCheckSchema>;

/** `GET /ready` readiness: database and pg-boss. */
export const ReadinessStatusSchema = z
  .object({
    status: z.enum(["ok", "degraded"]),
    checks: z.object({
      database: ReadinessCheckSchema,
      queue: ReadinessCheckSchema,
    }),
  })
  .meta({ id: "ReadinessStatus" });
export type ReadinessStatus = z.infer<typeof ReadinessStatusSchema>;
