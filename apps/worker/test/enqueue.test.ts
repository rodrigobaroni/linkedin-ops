import { describe, expect, it } from "vitest";
import { pgBossCvTailorEnqueue } from "../src/career/enqueue.js";

const POSTING = "0192f4a0-0000-7000-8000-0000000000aa";
const db = { executeSql: () => Promise.resolve({ rows: [] }) };

describe("pgBossCvTailorEnqueue (career PR 3b)", () => {
  it("sends cv.tailor on the extraction's transaction, with ids and the cycle only", async () => {
    const sent: unknown[][] = [];
    const enqueue = pgBossCvTailorEnqueue({
      send: (async (...args: unknown[]) => (sent.push(args), "job-1")) as never,
    });
    await expect(
      enqueue(db, { jobPostingId: POSTING, attempt: 2, correlationId: "req_abc" }),
    ).resolves.toBe("job-1");
    expect(sent).toEqual([
      [
        "cv.tailor",
        {
          schemaVersion: 1,
          correlationId: "req_abc",
          requestedBy: { type: "SYSTEM", id: "worker" },
          jobPostingId: POSTING,
          attempt: 2,
        },
        { db, singletonKey: POSTING },
      ],
    ]);
  });

  it("a job pg-boss did not create is an internal error (the transaction rolls back)", async () => {
    const enqueue = pgBossCvTailorEnqueue({ send: (async () => null) as never });
    await expect(enqueue(db, { jobPostingId: POSTING, attempt: 1 })).rejects.toThrow(
      "cv.tailor job was not created",
    );
  });
});
