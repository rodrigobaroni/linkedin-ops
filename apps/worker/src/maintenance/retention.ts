/**
 * Daily retention purge (T-063). The worker only schedules and runs it; what is purged, and with which period, is
 * `PrismaRetentionPurge` in the domain (periods fixed in ADRs, specs and code only). `dry-run` unless the operator
 * sets `RETENTION_PURGE=enabled`: deleting is irreversible.
 */
import type { RetentionPurgePayload } from "@linkedin-ops/contracts";
import type { PrismaRetentionPurge, RetentionPurgeMode } from "@linkedin-ops/domain";
import type { JobHandler } from "../jobs/runner.js";

/** Every day at 04:00, São Paulo time (timezone explicit, never the host's). */
export const RETENTION_PURGE_CRON = "0 4 * * *";
export const RETENTION_PURGE_TIMEZONE = "America/Sao_Paulo";

/** The scheduled payload: the envelope only; each run is traced by its job id. */
export function retentionPurgePayload(): RetentionPurgePayload {
  return {
    schemaVersion: 1,
    correlationId: "cron:retention.purge",
    requestedBy: { type: "SYSTEM", id: "cron" },
  };
}

export function createRetentionPurgeHandler(deps: {
  purge: Pick<PrismaRetentionPurge, "run">;
  mode: RetentionPurgeMode;
}): JobHandler<"retention.purge"> {
  return async (_payload, context) => {
    const result = await deps.purge.run({
      dryRun: deps.mode !== "enabled",
      correlationId: `job:${context.jobId}`,
    });
    // Counts per category only.
    context.logger.info({ retention: result }, "retention purge done");
  };
}
