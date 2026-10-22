/**
 * Container healthcheck entry point (`node apps/worker/dist/health/healthcheck.js`): exit 0 when the heartbeat
 * file is fresh, 1 otherwise. No network, no secrets.
 */
import { stat } from "node:fs/promises";
import { HEARTBEAT_FILE, HEARTBEAT_MAX_AGE_MS } from "./heartbeat.js";

export async function isHeartbeatFresh(
  file: string = HEARTBEAT_FILE,
  maxAgeMs: number = HEARTBEAT_MAX_AGE_MS,
  now: number = Date.now(),
): Promise<boolean> {
  try {
    const { mtimeMs } = await stat(file);
    return now - mtimeMs <= maxAgeMs;
  } catch {
    return false;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = (await isHeartbeatFresh()) ? 0 : 1;
}
