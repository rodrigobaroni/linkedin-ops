// @linkedin-ops/worker — entry point. Validates the environment first (fails closed), then starts pg-boss in
// its own `pgboss` schema, provisions the queues, registers the handlers and keeps a heartbeat for the
// container healthcheck. SIGTERM/SIGINT stop gracefully.
import { RuntimeEnvError, validateWorkerEnv, type WorkerRuntimeEnv } from "@linkedin-ops/domain";
import { PgBoss } from "pg-boss";
import { wireCareer } from "./career/wiring.js";
import { createLogger } from "./logger.js";
import { PGBOSS_SCHEMA_NAME } from "./jobs/queues.js";
import { startWorkerLifecycle } from "./lifecycle.js";

async function main(): Promise<void> {
  let env: WorkerRuntimeEnv;
  try {
    env = validateWorkerEnv(process.env);
  } catch (error) {
    if (error instanceof RuntimeEnvError) {
      // Names and reasons only (validateWorkerEnv never includes values).
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

  await startWorkerLifecycle({ boss, logger, career });
  logger.info({ nodeEnv: env.nodeEnv, openai: env.openai !== null }, "worker started");
}

await main();
