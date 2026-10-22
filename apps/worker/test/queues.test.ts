import { QUEUES } from "@linkedin-ops/contracts";
import { describe, expect, it } from "vitest";
import { WORK_OPTIONS, WORKER_QUEUES, provisionQueues } from "../src/jobs/queues.js";

function fakeBoss(existing: string[] = []) {
  const calls: Array<[string, string, Record<string, unknown> | undefined]> = [];
  const queues = new Set(existing);
  return {
    calls,
    boss: {
      getQueue: (name: string) => Promise.resolve(queues.has(name) ? ({ name } as never) : null),
      createQueue: (name: string, options?: Record<string, unknown>) => {
        calls.push(["create", name, options]);
        queues.add(name);
        return Promise.resolve();
      },
      updateQueue: (name: string, options?: Record<string, unknown>) => {
        calls.push(["update", name, options]);
        return Promise.resolve();
      },
    },
  };
}

describe("provisionQueues", () => {
  it("creates each dead-letter queue before its queue, with the catalogue's retry policy", async () => {
    const { boss, calls } = fakeBoss();
    await provisionQueues(boss as never);
    expect(calls.map(([op, name]) => `${op}:${name}`)).toEqual([
      "create:cv.extract.dlq",
      "create:cv.extract",
      "create:job.fetch.dlq",
      "create:job.fetch",
      "create:cv.tailor.dlq",
      "create:cv.tailor",
      "create:retention.purge.dlq",
      "create:retention.purge",
    ]);
    expect(calls[3]?.[2]).toEqual({
      retryLimit: 1,
      retryDelay: 60,
      retryBackoff: false,
      expireInSeconds: QUEUES["job.fetch"].expireInSeconds,
      deadLetter: "job.fetch.dlq",
    });
  });

  it("updates existing queues instead of recreating them (idempotent boot)", async () => {
    const { boss, calls } = fakeBoss(["cv.tailor", "cv.tailor.dlq"]);
    await provisionQueues(boss as never, ["cv.tailor"]);
    expect(calls.map(([op, name]) => `${op}:${name}`)).toEqual(["update:cv.tailor"]);
  });

  it("runs the career queues with concurrency 3 and job.fetch one per domain group", () => {
    expect(WORKER_QUEUES).toEqual(["cv.extract", "job.fetch", "cv.tailor", "retention.purge"]);
    for (const queue of ["cv.extract", "job.fetch", "cv.tailor"] as const)
      expect(WORK_OPTIONS[queue].localConcurrency).toBe(3);
    expect(WORK_OPTIONS["job.fetch"].groupConcurrency).toBe(1);
  });

  it("runs one retention purge at a time (T-063)", () => {
    expect(WORK_OPTIONS["retention.purge"].localConcurrency).toBe(1);
  });
});
