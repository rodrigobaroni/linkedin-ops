import { describe, expect, it } from "vitest";
import { QUEUES, QueueNameSchema, jobEnvelope, toJsonSchema } from "../src/index.js";
import { jobPayloads } from "./fixtures/jobs.js";

describe("jobs/queues catalogue (contracts.md §6.1)", () => {
  it("defines exactly the queues of the catalogue", () => {
    expect(Object.keys(QUEUES).sort()).toEqual([...QueueNameSchema.options].sort());
    for (const [name, queue] of Object.entries(QUEUES)) expect(queue.name).toBe(name);
  });

  it("publication.publish is never retried automatically (ADR-0003)", () => {
    expect(QUEUES["publication.publish"].retryLimit).toBe(0);
  });

  it("every payload carries schemaVersion, correlationId and requestedBy", () => {
    for (const queue of Object.values(QUEUES)) {
      const properties = toJsonSchema(queue.payload).properties as Record<string, unknown>;
      expect(Object.keys(properties)).toEqual(
        expect.arrayContaining(["schemaVersion", "correlationId", "requestedBy"]),
      );
      expect(toJsonSchema(queue.payload).required).toEqual(
        expect.arrayContaining(["schemaVersion", "correlationId", "requestedBy"]),
      );
    }
  });

  it("singleton keys follow the catalogue", () => {
    const parse = <N extends keyof typeof QUEUES>(name: N) =>
      QUEUES[name].payload.parse(jobPayloads[name]) as never;
    expect(QUEUES["source.fetch"].singletonKeyFrom?.(parse("source.fetch"))).toBe(
      jobPayloads["source.fetch"].sourceId,
    );
    expect(QUEUES["curation.run"].singletonKeyFrom?.(parse("curation.run"))).toBe(
      jobPayloads["curation.run"].curationRunId,
    );
    expect(QUEUES["draft.generate"].singletonKeyFrom?.(parse("draft.generate"))).toBe(
      jobPayloads["draft.generate"].draftId,
    );
    expect(QUEUES["publication.publish"].singletonKeyFrom?.(parse("publication.publish"))).toBe(
      jobPayloads["publication.publish"].publicationId,
    );
    expect(QUEUES["schedule.reconcile"].singletonKeyFrom?.(parse("schedule.reconcile"))).toBe(
      "schedule.reconcile",
    );
    expect(QUEUES["media.upload-linkedin"].singletonKeyFrom?.(parse("media.upload-linkedin"))).toBe(
      jobPayloads["media.upload-linkedin"].mediaAssetId,
    );
  });

  it("dead-letter queues are named after their queue and timings are positive", () => {
    for (const queue of Object.values(QUEUES)) {
      expect(queue.deadLetter).toBe(`${queue.name}.dlq`);
      expect(queue.expireInSeconds).toBeGreaterThan(0);
      expect(queue.retryLimit).toBeGreaterThanOrEqual(0);
    }
  });

  it("jobEnvelope pins the schema version", () => {
    const v2 = jobEnvelope(2);
    expect(
      v2.safeParse({
        schemaVersion: 2,
        correlationId: "c",
        requestedBy: { type: "SYSTEM", id: "cron" },
      }).success,
    ).toBe(true);
    expect(
      v2.safeParse({
        schemaVersion: 1,
        correlationId: "c",
        requestedBy: { type: "SYSTEM", id: "cron" },
      }).success,
    ).toBe(false);
  });
});
