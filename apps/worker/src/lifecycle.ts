/**
 * Worker lifecycle (ADR-0002 amendment; Crivo PR89-4): start pg-boss, register the handlers, keep the heartbeat,
 * and stop exactly once on SIGTERM/SIGINT: heartbeat first; then the worker's own shutdown signal aborts the
 * handlers in flight (LLM calls end as ABORTED) so each job is re-enqueued and settles as completed *before*
 * pg-boss stops; then a graceful pg-boss stop (up to `stopTimeoutMs`). Without that first step pg-boss would fail
 * the in-flight jobs on its own timeout, consuming a retry.
 */
import type { PgBoss } from "pg-boss";
import type { Logger } from "pino";
import type { CareerHandlers } from "./career/handlers.js";
import { startHeartbeat, type Heartbeat } from "./health/heartbeat.js";
import { registerWorkers } from "./worker.js";

export const STOP_TIMEOUT_MS = 30_000;
export const STOP_SIGNALS = ["SIGTERM", "SIGINT"] as const;

type Boss = Pick<
  PgBoss,
  "start" | "stop" | "getQueue" | "createQueue" | "updateQueue" | "work" | "send"
>;

export interface SignalSource {
  once(event: (typeof STOP_SIGNALS)[number], listener: () => void): unknown;
  off(event: (typeof STOP_SIGNALS)[number], listener: () => void): unknown;
}

export interface WorkerLifecycleOptions {
  boss: Boss;
  logger: Logger;
  career: CareerHandlers | null;
  /** Defaults to `process`. */
  signals?: SignalSource;
  /** Injected for tests; defaults to the heartbeat file writer. */
  heartbeat?: (probe: () => Promise<unknown>) => Heartbeat;
  stopTimeoutMs?: number;
}

export interface WorkerLifecycle {
  /** Idempotent: concurrent and repeated calls share one shutdown. */
  stop(reason: string): Promise<void>;
}

export async function startWorkerLifecycle(
  options: WorkerLifecycleOptions,
): Promise<WorkerLifecycle> {
  const { boss, logger } = options;
  const signals = options.signals ?? process;
  const stopTimeoutMs = options.stopTimeoutMs ?? STOP_TIMEOUT_MS;

  const shutdown = new AbortController();
  await boss.start();
  await registerWorkers({ boss, logger, career: options.career, shutdown: shutdown.signal });
  const probe = () => boss.getQueue("cv.tailor");
  const heartbeat =
    options.heartbeat?.(probe) ??
    startHeartbeat({
      probe,
      onError: (error) =>
        logger.warn(
          { errorClass: error instanceof Error ? error.name : "unknown" },
          "heartbeat probe failed",
        ),
    });

  let stopping: Promise<void> | null = null;
  const listeners = new Map<(typeof STOP_SIGNALS)[number], () => void>();
  const stop = (reason: string): Promise<void> => {
    stopping ??= (async () => {
      for (const [signal, listener] of listeners) signals.off(signal, listener);
      logger.info({ reason }, "worker stopping");
      heartbeat.stop();
      shutdown.abort();
      await boss.stop({ graceful: true, timeout: stopTimeoutMs });
      logger.info("worker stopped");
    })();
    return stopping;
  };
  for (const signal of STOP_SIGNALS) {
    const listener = () => void stop(signal);
    listeners.set(signal, listener);
    signals.once(signal, listener);
  }
  return { stop };
}
