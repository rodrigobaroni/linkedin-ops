import type { OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import {
  CvExtractPayloadSchema,
  CvTailorPayloadSchema,
  JobFetchPayloadSchema,
  PGBOSS_SCHEMA_NAME,
  QUEUES,
  type CvExtractPayload,
  type CvTailorPayload,
  type JobFetchPayload,
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
   * Resolves when the producer can send; rejects at once when it cannot (never waits for a start). Called
   * BEFORE the draft's transaction opens, so a queue outage never holds a transaction (nor the owner's lock).
   */
  ensureReady(): Promise<void>;
  /**
   * Inserts the job through `db`, the transaction that creates the draft (ADR-0002 §3): the job exists only
   * if the draft commits. Returns the job id. Never starts the producer: rejects if `ensureReady` did not.
   */
  enqueue(payload: CvExtractPayload, db: SqlExecutor): Promise<{ jobId: string }>;
}

/** Injection token of the `job.fetch`/`cv.tailor` producer (the same pg-boss instance as `cv.extract`). */
export const JOB_POSTING_QUEUE = Symbol("JOB_POSTING_QUEUE");

/**
 * Producer side of `job.fetch` and `cv.tailor` (career PR 3b). Same rules as `CvExtractQueue`: `ensureReady`
 * before the transaction opens, every enqueue through `db` (the posting's transaction), payloads with ids
 * only (the URL and the posting text stay in `job_postings`).
 */
export interface JobPostingQueue {
  ensureReady(): Promise<void>;
  /** `groupId` serializes the fetches of one domain (`groupConcurrency: 1`, ADR-0008 §4). */
  enqueueFetch(
    payload: JobFetchPayload,
    groupId: string,
    db: SqlExecutor,
  ): Promise<{ jobId: string }>;
  enqueueTailor(payload: CvTailorPayload, db: SqlExecutor): Promise<{ jobId: string }>;
}

/** A job of the same singleton (posting) is still pending: pg-boss created nothing. */
export class CareerJobAlreadyQueuedError extends Error {
  constructor(readonly queue: string) {
    super(`${queue} job already pending for this item`);
    this.name = "CareerJobAlreadyQueuedError";
  }
}

const CV_EXTRACT = QUEUES["cv.extract"];
const JOB_FETCH = QUEUES["job.fetch"];
const CV_TAILOR = QUEUES["cv.tailor"];

export const CV_EXTRACT_QUEUE_START_TIMEOUT_MS = 10_000;

/** Background start retries: 1 s, 2 s, 4 s … capped at 60 s, until the worker has created the schema. */
export const CV_EXTRACT_QUEUE_RETRY = { initialMs: 1_000, maxMs: 60_000 } as const;

export class CvExtractQueueUnavailableError extends Error {
  constructor(reason: "start_failed" | "start_timeout" | "not_started") {
    super(`cv.extract producer unavailable: ${reason}`);
    this.name = "CvExtractQueueUnavailableError";
  }
}

export interface PgBossCvExtractQueueOptions {
  startTimeoutMs?: number;
  retry?: { initialMs: number; maxMs: number };
}

/**
 * pg-boss producer of the career queues (`cv.extract`, `job.fetch`, `cv.tailor`): one instance behind both
 * injection tokens. The API only sends: it neither migrates the `pgboss` schema nor provisions queues (the
 * worker does both at boot) and runs no maintenance or cron. pg-boss starts at application bootstrap, with a
 * timeout, and never inside a request: if the start fails (e.g. the worker has not migrated the schema yet)
 * the API still boots, retries in the background with backoff, and uploads answer 503 before any
 * transaction until the producer is ready. `enqueue` never starts pg-boss.
 */
export class PgBossCvExtractQueue
  implements CvExtractQueue, JobPostingQueue, OnApplicationBootstrap, OnApplicationShutdown
{
  readonly #boss: PgBoss;
  readonly #logger: Logger;
  readonly #startTimeoutMs: number;
  readonly #retry: { initialMs: number; maxMs: number };
  #ready = false;
  #closed = false;
  #attempted = false;
  #attempts = 0;
  #starting: Promise<void> | undefined;
  #retryTimer: NodeJS.Timeout | undefined;

  constructor(databaseUrl: string, logger: Logger, options: PgBossCvExtractQueueOptions = {}) {
    this.#logger = logger;
    this.#startTimeoutMs = options.startTimeoutMs ?? CV_EXTRACT_QUEUE_START_TIMEOUT_MS;
    this.#retry = options.retry ?? CV_EXTRACT_QUEUE_RETRY;
    this.#boss = new PgBoss({
      connectionString: databaseUrl,
      schema: PGBOSS_SCHEMA_NAME,
      application_name: "linkedin-ops-api",
      max: 2,
      connectionTimeoutMillis: this.#startTimeoutMs,
      migrate: false,
      supervise: false,
      schedule: false,
    });
    this.#boss.on("error", (error: Error) =>
      logger.error({ queue: CV_EXTRACT.name, errorClass: error.name }, "pg-boss error"),
    );
  }

  get ready(): boolean {
    return this.#ready;
  }

  /**
   * One start attempt, awaited so a reachable database is ready before the first request; a failure never
   * fails the boot (no crash loop while the worker migrates) and schedules the background retries.
   */
  async onApplicationBootstrap(): Promise<void> {
    await this.#attempt();
  }

  ensureReady(): Promise<void> {
    if (this.#ready) return Promise.resolve();
    return Promise.reject(new CvExtractQueueUnavailableError("not_started"));
  }

  async enqueue(payload: CvExtractPayload, db: SqlExecutor): Promise<{ jobId: string }> {
    if (!this.#ready) throw new CvExtractQueueUnavailableError("not_started");
    const valid = CvExtractPayloadSchema.parse(payload);
    const jobId = await this.#boss.send(CV_EXTRACT.name, valid, {
      db,
      singletonKey: CV_EXTRACT.singletonKeyFrom?.(valid),
    });
    // A new draft id never collides with a pending singleton; null would mean a lost job.
    if (jobId === null) throw new Error("cv.extract job was not created");
    return { jobId };
  }

  async enqueueFetch(
    payload: JobFetchPayload,
    groupId: string,
    db: SqlExecutor,
  ): Promise<{ jobId: string }> {
    if (!this.#ready) throw new CvExtractQueueUnavailableError("not_started");
    const valid = JobFetchPayloadSchema.parse(payload);
    const jobId = await this.#boss.send(JOB_FETCH.name, valid, {
      db,
      singletonKey: JOB_FETCH.singletonKeyFrom?.(valid),
      group: { id: groupId },
    });
    if (jobId === null) throw new CareerJobAlreadyQueuedError(JOB_FETCH.name);
    return { jobId };
  }

  async enqueueTailor(payload: CvTailorPayload, db: SqlExecutor): Promise<{ jobId: string }> {
    if (!this.#ready) throw new CvExtractQueueUnavailableError("not_started");
    const valid = CvTailorPayloadSchema.parse(payload);
    const jobId = await this.#boss.send(CV_TAILOR.name, valid, {
      db,
      singletonKey: CV_TAILOR.singletonKeyFrom?.(valid),
    });
    if (jobId === null) throw new CareerJobAlreadyQueuedError(CV_TAILOR.name);
    return { jobId };
  }

  async onApplicationShutdown(): Promise<void> {
    this.#closed = true;
    clearTimeout(this.#retryTimer);
    this.#retryTimer = undefined;
    if (!this.#attempted) return;
    await this.#starting?.catch(() => undefined);
    await this.#boss.stop({ graceful: false, close: true });
  }

  /** Resolves in every case; on failure or timeout schedules the next attempt. */
  async #attempt(): Promise<void> {
    if (this.#ready || this.#closed) return;
    this.#attempted = true;
    this.#attempts += 1;
    // One start in flight at a time; a start that outlives its timeout keeps running and the next attempt
    // waits on it instead of starting another.
    this.#starting ??= this.#boss.start().then(
      () => {
        this.#ready = true;
        this.#logger.info(
          { queue: CV_EXTRACT.name, attempts: this.#attempts },
          "cv.extract producer ready",
        );
      },
      (error: unknown) => {
        this.#starting = undefined;
        throw error;
      },
    );
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), this.#startTimeoutMs);
      timer.unref();
    });
    let failure: string | null = null;
    try {
      if ((await Promise.race([this.#starting, timeout])) === "timeout") failure = "TIMEOUT";
    } catch (error) {
      failure = error instanceof Error ? error.name : "unknown";
    } finally {
      clearTimeout(timer);
    }
    if (failure === null || this.#closed) return;
    const delayMs = Math.min(this.#retry.initialMs * 2 ** (this.#attempts - 1), this.#retry.maxMs);
    // Class only: the driver error may quote the connection target.
    this.#logger.warn(
      { queue: CV_EXTRACT.name, errorClass: failure, attempt: this.#attempts, retryInMs: delayMs },
      "cv.extract producer start failed; retrying in the background",
    );
    this.#retryTimer = setTimeout(() => void this.#attempt(), delayMs);
    this.#retryTimer.unref();
  }
}
