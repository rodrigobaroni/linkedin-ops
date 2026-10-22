import type { OnApplicationShutdown } from "@nestjs/common";
import {
  CvExtractPayloadSchema,
  PGBOSS_SCHEMA_NAME,
  QUEUES,
  type CvExtractPayload,
} from "@linkedin-ops/contracts";
import type { SqlExecutor } from "@linkedin-ops/domain";
import { PgBoss } from "pg-boss";
import type { Logger } from "pino";

/** Injection token of the `cv.extract` producer. */
export const CV_EXTRACT_QUEUE = Symbol("CV_EXTRACT_QUEUE");

/**
 * Producer side of `cv.extract` (contracts.md §6.1). The payload carries only the draft id: the PDF text
 * stays in `cv_bases.extracted_text` and never goes into the job table.
 */
export interface CvExtractQueue {
  /**
   * Inserts the job through `db`, the transaction that creates the draft (ADR-0002 §3): the job exists only
   * if the draft commits. Returns the job id.
   */
  enqueue(payload: CvExtractPayload, db: SqlExecutor): Promise<{ jobId: string }>;
}

const CV_EXTRACT = QUEUES["cv.extract"];

/**
 * pg-boss producer. The API only sends: it neither migrates the `pgboss` schema nor provisions queues (the
 * worker does both at boot) and runs no maintenance or cron. pg-boss starts on the first send, so the API
 * boots while the worker is still coming up; until then an upload answers 503 and stores nothing.
 */
export class PgBossCvExtractQueue implements CvExtractQueue, OnApplicationShutdown {
  readonly #boss: PgBoss;
  #started: Promise<unknown> | undefined;

  constructor(databaseUrl: string, logger: Logger) {
    this.#boss = new PgBoss({
      connectionString: databaseUrl,
      schema: PGBOSS_SCHEMA_NAME,
      application_name: "linkedin-ops-api",
      max: 2,
      migrate: false,
      supervise: false,
      schedule: false,
    });
    this.#boss.on("error", (error: Error) =>
      logger.error({ queue: CV_EXTRACT.name, errorClass: error.name }, "pg-boss error"),
    );
  }

  async enqueue(payload: CvExtractPayload, db: SqlExecutor): Promise<{ jobId: string }> {
    const valid = CvExtractPayloadSchema.parse(payload);
    await this.#start();
    const jobId = await this.#boss.send(CV_EXTRACT.name, valid, {
      db,
      singletonKey: CV_EXTRACT.singletonKeyFrom?.(valid),
    });
    // A new draft id never collides with a pending singleton; null would mean a lost job.
    if (jobId === null) throw new Error("cv.extract job was not created");
    return { jobId };
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.#started === undefined) return;
    await this.#started.catch(() => undefined);
    await this.#boss.stop({ graceful: false, close: true });
  }

  #start(): Promise<unknown> {
    this.#started ??= this.#boss.start().catch((error: unknown) => {
      // Retried on the next upload (e.g. the worker has not created the schema yet).
      this.#started = undefined;
      throw error;
    });
    return this.#started;
  }
}
