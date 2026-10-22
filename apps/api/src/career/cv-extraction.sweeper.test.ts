import type { CvStructured } from "@linkedin-ops/contracts";
import type { PrismaCvBases } from "@linkedin-ops/domain";
import type { Logger } from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CvExtractionSweeper } from "./cv-extraction.sweeper.js";

function setup(intervalMs: number | null, settle: () => Promise<number>) {
  const settleStaleExtractions = vi.fn(settle);
  const logger = { info: vi.fn(), warn: vi.fn() };
  const sweeper = new CvExtractionSweeper(
    { settleStaleExtractions } as unknown as PrismaCvBases<CvStructured>,
    { intervalMs },
    logger as unknown as Logger,
  );
  return { sweeper, settleStaleExtractions, logger };
}

describe("CvExtractionSweeper (Sentinela S-2)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("sweeps once at boot and then every interval, without any read", async () => {
    const { sweeper, settleStaleExtractions } = setup(60_000, async () => 0);
    sweeper.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);
    expect(settleStaleExtractions).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(settleStaleExtractions).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(settleStaleExtractions).toHaveBeenCalledTimes(4);

    await sweeper.onApplicationShutdown();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(settleStaleExtractions).toHaveBeenCalledTimes(4);
  });

  it("is off when the interval is null", async () => {
    const { sweeper, settleStaleExtractions } = setup(null, async () => 0);
    sweeper.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(settleStaleExtractions).not.toHaveBeenCalled();
  });

  it("logs a failed pass by error name only and keeps sweeping", async () => {
    let calls = 0;
    const { sweeper, settleStaleExtractions, logger } = setup(1_000, async () => {
      calls += 1;
      if (calls === 1) throw new Error("connection refused CANARIO-SWEEP");
      return 2;
    });
    sweeper.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(settleStaleExtractions).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith({ errorName: "Error" }, "cv extraction sweep failed");
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("CANARIO-SWEEP");
    expect(logger.info).toHaveBeenCalledWith(
      { settled: 2 },
      "cv extraction sweep settled stale drafts",
    );
    await sweeper.onApplicationShutdown();
  });

  it("never runs two passes at once", async () => {
    let release: (value: number) => void = () => {};
    const { sweeper, settleStaleExtractions } = setup(
      null,
      () => new Promise((r) => (release = r)),
    );
    const first = sweeper.sweep();
    const second = sweeper.sweep();
    expect(settleStaleExtractions).toHaveBeenCalledTimes(1);
    release(1);
    expect(await first).toBe(1);
    expect(await second).toBe(1);
  });
});
