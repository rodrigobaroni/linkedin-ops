import { EventEmitter } from "node:events";
import { pino } from "pino";
import { describe, expect, it } from "vitest";
import { STOP_TIMEOUT_MS, startWorkerLifecycle } from "../src/lifecycle.js";

function fakeBoss() {
  const calls: string[] = [];
  const stops: unknown[] = [];
  let release: () => void = () => undefined;
  const boss = {
    start: () => (calls.push("start"), Promise.resolve()),
    stop: (options: unknown) => {
      calls.push("stop");
      stops.push(options);
      return new Promise<void>((resolve) => (release = resolve));
    },
    getQueue: () => Promise.resolve(null),
    createQueue: () => Promise.resolve(),
    updateQueue: () => Promise.resolve(),
    work: () => Promise.resolve("w"),
  };
  return { boss, calls, stops, release: () => release() };
}

async function start() {
  const signals = new EventEmitter();
  const fake = fakeBoss();
  let heartbeatStops = 0;
  const lifecycle = await startWorkerLifecycle({
    boss: fake.boss as never,
    logger: pino({ level: "silent" }),
    career: null,
    signals: signals as never,
    heartbeat: () => ({ stop: () => void (heartbeatStops += 1) }),
  });
  return { signals, fake, lifecycle, heartbeatStops: () => heartbeatStops };
}

describe("worker lifecycle (Crivo PR89-4)", () => {
  it("starts pg-boss and listens for SIGTERM and SIGINT", async () => {
    const { signals, fake } = await start();
    expect(fake.calls).toEqual(["start"]);
    expect(signals.listenerCount("SIGTERM")).toBe(1);
    expect(signals.listenerCount("SIGINT")).toBe(1);
  });

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    it(`${signal}: stops the heartbeat, then pg-boss gracefully with a 30 s timeout, once`, async () => {
      const { signals, fake, lifecycle, heartbeatStops } = await start();
      signals.emit(signal);
      signals.emit(signal === "SIGTERM" ? "SIGINT" : "SIGTERM");
      const again = lifecycle.stop("manual");
      expect(heartbeatStops()).toBe(1);
      expect(fake.stops).toEqual([{ graceful: true, timeout: STOP_TIMEOUT_MS }]);
      expect(STOP_TIMEOUT_MS).toBe(30_000);
      fake.release();
      await again;
      expect(fake.calls).toEqual(["start", "stop"]);
      expect(signals.listenerCount("SIGTERM") + signals.listenerCount("SIGINT")).toBe(0);
    });
  }
});
