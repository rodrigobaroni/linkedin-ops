import { mkdtemp, readFile, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isHeartbeatFresh } from "../src/health/healthcheck.js";
import { startHeartbeat } from "../src/health/heartbeat.js";

async function tempFile() {
  return join(await mkdtemp(join(tmpdir(), "worker-hb-")), "beat");
}

describe("heartbeat and healthcheck", () => {
  it("writes a beat when the probe succeeds and the healthcheck sees it fresh", async () => {
    const file = await tempFile();
    const beat = startHeartbeat({ probe: () => Promise.resolve(), file, intervalMs: 10_000 });
    await expect.poll(() => readFile(file, "utf8").catch(() => "")).not.toBe("");
    beat.stop();
    expect(await isHeartbeatFresh(file)).toBe(true);
  });

  it("writes nothing when the probe fails, and stale or missing files are unhealthy", async () => {
    const file = await tempFile();
    const errors: unknown[] = [];
    const beat = startHeartbeat({
      probe: () => Promise.reject(new Error("db down")),
      file,
      intervalMs: 10_000,
      onError: (e) => errors.push(e),
    });
    await expect.poll(() => errors.length).toBe(1);
    beat.stop();
    expect(await isHeartbeatFresh(file)).toBe(false);
    const stale = await tempFile();
    startHeartbeat({ probe: () => Promise.resolve(), file: stale, intervalMs: 10_000 }).stop();
    await expect.poll(() => readFile(stale, "utf8").catch(() => "")).not.toBe("");
    await utimes(stale, new Date(0), new Date(0));
    expect(await isHeartbeatFresh(stale)).toBe(false);
  });
});
