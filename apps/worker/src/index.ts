// @linkedin-ops/worker — entry point. Validates the environment first (fails closed), then starts pg-boss in
// its own `pgboss` schema, provisions the queues, registers the handlers and keeps a heartbeat for the
// container healthcheck. SIGTERM/SIGINT stop gracefully.
import { CvStructuredSchema } from "@linkedin-ops/contracts";
import {
  createPrismaClient,
  PrismaCvBaseDraftStore,
  PrismaCvBases,
  PrismaFetchDomainGuard,
  RuntimeEnvError,
  validateWorkerEnv,
  type WorkerRuntimeEnv,
} from "@linkedin-ops/domain";
import { PgBoss } from "pg-boss";
import { HttpJobPageFetcher } from "./career/http-job-page-fetcher.js";
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

  // Domain stores over Prisma (connections open lazily). The postings store arrives with career PR 3.
  const prisma = createPrismaClient({ connectionString: env.databaseUrl });
  const cvStore = new PrismaCvBaseDraftStore(
    new PrismaCvBases(prisma, (value) => CvStructuredSchema.parse(value)),
  );
  // Anonymous job-page fetcher (ADR-0008): the per-domain limiter, breaker and kill switch live in Postgres, so
  // they survive restarts and are shared by every worker process. Consumed once the postings store is wired.
  const fetcher = new HttpJobPageFetcher({
    guard: new PrismaFetchDomainGuard(prisma, () => new Date(), {
      linkedInFetch: env.jobFetchLinkedIn,
    }),
  });
  const career = wireCareer(env, logger, { cvStore, fetcher });

  await startWorkerLifecycle({ boss, logger, career, onStopped: () => prisma.$disconnect() });
  logger.info({ nodeEnv: env.nodeEnv, openai: env.openai !== null }, "worker started");
}

await main();
