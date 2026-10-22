/**
 * Liveness without HTTP (ADR-0002, Compose healthcheck): while pg-boss is started and the database answers,
 * the worker rewrites a heartbeat file every `intervalMs`. The container healthcheck (`healthcheck.ts`) fails
 * when the file is older than `HEARTBEAT_MAX_AGE_MS`.
 */
import { writeFile } from "node:fs/promises";

export const HEARTBEAT_FILE = "/tmp/linkedin-ops-worker.heartbeat";
export const HEARTBEAT_INTERVAL_MS = 15_000;
export const HEARTBEAT_MAX_AGE_MS = 60_000;

export interface Heartbeat {
  stop(): void;
}

/** `probe` must reject when the worker is unhealthy (e.g. database unreachable); then no beat is written. */
export function startHeartbeat(options: {
  probe: () => Promise<unknown>;
  file?: string;
  intervalMs?: number;
  onError?: (error: unknown) => void;
}): Heartbeat {
  const file = options.file ?? HEARTBEAT_FILE;
  const beat = async () => {
    try {
      await options.probe();
      await writeFile(file, String(Date.now()), { encoding: "utf8", mode: 0o644 });
    } catch (error) {
      options.onError?.(error);
    }
  };
  void beat();
  const timer = setInterval(() => void beat(), options.intervalMs ?? HEARTBEAT_INTERVAL_MS);
  timer.unref();
  return { stop: () => clearInterval(timer) };
}
