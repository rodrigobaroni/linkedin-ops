import { RetentionPurgePayloadSchema } from "@linkedin-ops/contracts";
import { pino } from "pino";
import { describe, expect, it } from "vitest";
import {
  RETENTION_PURGE_CRON,
  RETENTION_PURGE_TIMEZONE,
  createRetentionPurgeHandler,
  retentionPurgePayload,
} from "../src/maintenance/retention.js";

const context = {
  jobId: "job-1",
  retryCount: 0,
  isLastAttempt: false,
  signal: new AbortController().signal,
  logger: pino({ level: "silent" }),
};

function fakePurge() {
  const calls: { dryRun: boolean; correlationId?: string }[] = [];
  return {
    calls,
    purge: {
      run: (options: { dryRun: boolean; correlationId?: string }) => (
        calls.push(options),
        Promise.resolve({ dryRun: options.dryRun, sessions: 2, oauthStates: 0, idempotencyKeys: 1 })
      ),
    },
  };
}

describe("retention.purge handler (T-063)", () => {
  it("dry-run mode only counts", async () => {
    const { purge, calls } = fakePurge();
    await createRetentionPurgeHandler({ purge, mode: "dry-run" })(retentionPurgePayload(), context);
    expect(calls).toEqual([{ dryRun: true, correlationId: "job:job-1" }]);
  });

  it("enabled mode deletes", async () => {
    const { purge, calls } = fakePurge();
    await createRetentionPurgeHandler({ purge, mode: "enabled" })(retentionPurgePayload(), context);
    expect(calls).toEqual([{ dryRun: false, correlationId: "job:job-1" }]);
  });

  it("runs daily at 04:00 São Paulo time with a valid, id-free payload", () => {
    expect(RETENTION_PURGE_CRON).toBe("0 4 * * *");
    expect(RETENTION_PURGE_TIMEZONE).toBe("America/Sao_Paulo");
    expect(RetentionPurgePayloadSchema.parse(retentionPurgePayload())).toEqual({
      schemaVersion: 1,
      correlationId: "cron:retention.purge",
      requestedBy: { type: "SYSTEM", id: "cron" },
    });
  });
});
