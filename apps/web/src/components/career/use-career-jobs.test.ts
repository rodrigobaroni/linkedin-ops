import { describe, expect, it } from "vitest";
import { JOBS_POLL } from "@/lib/api";
import { pollDelay } from "./use-career-jobs";

describe("pollDelay", () => {
  it("backs off on failed reads too, and stops once nothing is processing", () => {
    const since = { current: null as number | null };
    expect(pollDelay(true, { dataUpdateCount: 1, errorUpdateCount: 0 }, since, 3_000)).toBe(3_000);
    // Two failed reads in a row: the interval keeps growing instead of staying at 3 s.
    expect(pollDelay(true, { dataUpdateCount: 1, errorUpdateCount: 1 }, since, 3_000)).toBe(4_500);
    expect(pollDelay(true, { dataUpdateCount: 1, errorUpdateCount: 2 }, since, 3_000)).toBe(6_750);
    expect(pollDelay(true, { dataUpdateCount: 9, errorUpdateCount: 9 }, since, 3_000)).toBe(
      JOBS_POLL.maxMs,
    );
    expect(pollDelay(false, { dataUpdateCount: 10, errorUpdateCount: 9 }, since, 3_000)).toBe(
      false,
    );
    expect(since.current).toBeNull();
  });
});
