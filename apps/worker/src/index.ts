// @linkedin-ops/worker — entry point. Validates the environment first (fails closed), then starts pg-boss in
// its own `pgboss` schema, provisions the queues, registers the handlers and keeps a heartbeat for the
// container healthcheck. SIGTERM/SIGINT stop gracefully.
import { RuntimeEnvError, validateRuntimeEnv, type RuntimeEnv } from "@linkedin-ops/domain";
import { PgBoss } from "pg-boss";
import { startHeartbeat } from "./health/heartbeat.js";
import { wireCareer } from "./career/wiring.js";
import { createLogger } from "./logger.js";
import { PGBOSS_SCHEMA_NAME } from "./jobs/queues.js";
import { registerWorkers } from "./worker.js";

const STOP_TIMEOUT_MS = 30_000;

async function main(): Promise<void> {
  let env: RuntimeEnv;
  try {
    env = validateRuntimeEnv(process.env, { service: "worker" });
  } catch (error) {
    if (error instanceof RuntimeEnvError) {
      // Names and reasons only (validateRuntimeEnv never includes values).
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }

  const logger = createLogger(env.logLevel);
  const boss = new PgBoss({
    connectionString: env.databaseUrl,
    schema: PGBOSS_SCHEMA_NAME,
    application_name: "linkedin-ops-worker",
  });
  boss.on("error", (error: Error) => logger.error({ errorClass: error.name }, "pg-boss error"));

  // The Career stores are bound to the domain repositories in PR 2 (CV) and PR 3 (postings).
  const career = wireCareer(env, logger, null);

  await boss.start();
  await registerWorkers({ boss, logger, career });
  const heartbeat = startHeartbeat({
    probe: () => boss.getQueue("cv.tailor"),
    onError: (error) =>
      logger.warn(
        { errorClass: error instanceof Error ? error.name : "unknown" },
        "heartbeat probe failed",
      ),
  });
  logger.info({ nodeEnv: env.nodeEnv, openai: env.openai !== null }, "worker started");

  let stopping = false;
  const stop = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, "worker stopping");
    heartbeat.stop();
    await boss.stop({ graceful: true, timeout: STOP_TIMEOUT_MS });
    logger.info("worker stopped");
  };
  process.once("SIGTERM", () => void stop("SIGTERM"));
  process.once("SIGINT", () => void stop("SIGINT"));
}

await main();
