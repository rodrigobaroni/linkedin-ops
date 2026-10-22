import {
  JobPostingExtractedSchema,
  MatchReportSchema,
  QUEUES,
  TailoredCvContentSchema,
  type JobPostingExtracted,
  type JobPostingFailure,
  type JobPostingSourceKind,
  type JobPostingStatus,
  type MatchReport,
  type TailoredCvContent,
} from "@linkedin-ops/contracts";
import type { PrismaClient } from "../client.js";
import { Prisma } from "../generated/prisma/client.js";
import { newId } from "../ids.js";
import { CV_EXTRACTION_STALE_MS, type CvAuditMeta } from "./cv-bases.js";
import { FETCH_QUOTA_WINDOW_MS, JOB_FETCH_PASTED_GROUP, jobFetchGroupId } from "./fetch-domain.js";
import {
  isFetchableJobPostingUrl,
  jobPostingSourceOf,
  jobPostingUrlHash,
  normalizeJobPostingUrl,
} from "./job-posting-url.js";
import type { GenerationInfo } from "./ports.js";
import { lockOwner, sqlExecutor, type SqlExecutor, type Transaction } from "./transaction.js";

const JOB_FETCH_QUEUE = QUEUES["job.fetch"];
const CV_TAILOR_QUEUE = QUEUES["cv.tailor"];
const QUEUE_LATENCY_MARGIN_MS = 10 * 60 * 1000;

/** Contract bounds of a batch (spec §3, §7 and §9; Maestro decision 2026-10-22: 1–20, not 5–20). */
export const TAILORING_BATCH_MAX_LINKS = 20;
/** Longest posting text kept (`job_postings_page_text_check`, the engine's `JOB_TEXT_MAX_CHARS`). */
export const JOB_POSTING_TEXT_MAX_CHARS = 20_000;
/** Longest normalized link kept (`job_postings_url_check`); normalizing may grow a link (percent-encoding). */
export const JOB_POSTING_URL_MAX_CHARS = 2048;
/** Longest injection excerpt kept with a posting (`job_postings_injection_evidence_check`). */
export const JOB_POSTING_INJECTION_EVIDENCE_MAX_CHARS = 500;

/**
 * A posting still `FETCHING`/`ANALYZING` after every attempt its job could have made was lost by the queue: it
 * becomes `FAILED`/`TIMED_OUT` (sweep and read). `FETCHING` also covers the wait of a rescheduled `job.fetch`
 * (per-domain interval and the 24 h LinkedIn quota, ADR-0008 §4); `ANALYZING` covers `cv.tailor` with backoff.
 */
export const JOB_POSTING_STALE_MS = {
  FETCHING:
    FETCH_QUOTA_WINDOW_MS +
    (JOB_FETCH_QUEUE.retryLimit + 1) * JOB_FETCH_QUEUE.expireInSeconds * 1000 +
    JOB_FETCH_QUEUE.retryLimit * JOB_FETCH_QUEUE.retryDelaySeconds * 1000 +
    QUEUE_LATENCY_MARGIN_MS,
  ANALYZING:
    (CV_TAILOR_QUEUE.retryLimit + 1) * CV_TAILOR_QUEUE.expireInSeconds * 1000 +
    CV_TAILOR_QUEUE.retryDelaySeconds * (2 ** CV_TAILOR_QUEUE.retryLimit - 1) * 1000 +
    QUEUE_LATENCY_MARGIN_MS,
} as const satisfies Partial<Record<JobPostingStatus, number>>;

/**
 * Retention of the page text of a `FAILED` posting. The spec sets none, so the CV rule applies (Maestro,
 * 2026-10-22): the CV text lives at most `CV_EXTRACTION_STALE_MS` once its processing ended. Afterwards a
 * retry fetches the page again and a pasted posting falls back to its link.
 */
export const JOB_POSTING_FAILED_TEXT_RETENTION_MS = CV_EXTRACTION_STALE_MS;

/** Postings settled (and texts erased) per sweep; the rest waits for the next tick (every 5 min). */
export const JOB_POSTING_SWEEP_BATCH = 50;

/** Who acted, for the audit trail; snapshots carry ids, statuses and counts, never URLs nor text. */
export type CareerAuditMeta = CvAuditMeta;

/** A job of one posting's processing cycle (`attempt` goes into the payload: late-job guard). */
export interface CvTailorJob {
  jobPostingId: string;
  attempt: number;
}

/** One `job.fetch` to enqueue: `groupId` is the domain of the link, or `pasted` (no site is touched). */
export interface JobFetchJob extends CvTailorJob {
  groupId: string;
}

/** Enqueues `job.fetch` on `db` (the posting's transaction) and returns the job id. */
export type JobFetchEnqueue = (db: SqlExecutor, job: JobFetchJob) => Promise<string>;
/** Enqueues `cv.tailor` on `db` (the posting's transaction) and returns the job id. */
export type CvTailorEnqueue = (db: SqlExecutor, job: CvTailorJob) => Promise<string>;

export interface TailoringRecord {
  /** The CV base version the tailoring used. */
  cvBaseId: string;
  /** The owner's active CV base changed after this tailoring (the web offers reprocessing). */
  generatedWithPreviousCv: boolean;
  content: TailoredCvContent;
  report: MatchReport;
  generation: GenerationInfo;
  /** When this tailored CV was produced (a reprocessing replaces it). */
  generatedAt: Date;
}

export interface JobPostingSummaryRecord {
  id: string;
  batchId: string;
  url: string;
  source: JobPostingSourceKind;
  status: JobPostingStatus;
  failureReason: JobPostingFailure | null;
  /** From the extraction; null until `ANALYZING`. */
  title: string | null;
  company: string | null;
  /** Score of the base CV, only when `READY`. */
  baseScore: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface JobPostingRecord extends JobPostingSummaryRecord {
  extracted: JobPostingExtracted | null;
  droppedRequirementCount: number | null;
  injectionSuspected: boolean;
  /** Posting text quoted by the model: shown to the owner only, never logged nor audited. */
  injectionEvidence: string | null;
  fetchedAt: Date | null;
  /** Only when `READY`. */
  tailoring: TailoringRecord | null;
}

export interface CreatedBatch {
  batchId: string;
  cvBaseId: string;
  postings: JobPostingSummaryRecord[];
  /** One `job.fetch` per posting created `FETCHING`, in `postings` order (none for a blocked link). */
  jobIds: string[];
  /** Links of the request that normalized to one already in the batch. */
  duplicatesMerged: number;
  /** LinkedIn links that are not a job view: created `FAILED`/`FETCH_BLOCKED`, with no job (ADR-0008 §1). */
  blocked: number;
}

/**
 * Links whose normalized form exceeds `JOB_POSTING_URL_MAX_CHARS` (it can grow past the contract bound, e.g.
 * `é` → `%C3%A9`). Checked before any transaction; `positions` are 1-based, in request order (the links
 * themselves are personal data and never go into the error).
 */
export class JobPostingUrlTooLongError extends Error {
  constructor(readonly positions: number[]) {
    super(`Job links too long once normalized: ${positions.join(", ")}`);
    this.name = "JobPostingUrlTooLongError";
  }
}

/**
 * Reprocessing would fetch a link `job.fetch` may not read (a LinkedIn page that is not a job view, and no
 * text to re-read): the owner has to paste the text.
 */
export class JobPostingTextRequiredError extends Error {
  constructor() {
    super("This posting link cannot be fetched; paste its text");
    this.name = "JobPostingTextRequiredError";
  }
}

/** A batch needs a confirmed, active CV base (spec §9). */
export class CvBaseRequiredError extends Error {
  constructor() {
    super("No confirmed CV base to tailor against");
    this.name = "CvBaseRequiredError";
  }
}

/** No posting with that id for that owner. */
export class JobPostingNotFoundError extends Error {
  constructor() {
    super("Job posting not found");
    this.name = "JobPostingNotFoundError";
  }
}

/** Pasting text or reprocessing a posting still being processed (`FETCHING`/`ANALYZING`). */
export class JobPostingBusyError extends Error {
  constructor(readonly status: JobPostingStatus) {
    super(`Job posting is ${status}`);
    this.name = "JobPostingBusyError";
  }
}

type PostingRow = Awaited<ReturnType<PrismaClient["jobPosting"]["findUniqueOrThrow"]>>;
type TailoredRow = Awaited<ReturnType<PrismaClient["tailoredCv"]["findUniqueOrThrow"]>>;
type StalePosting = { id: string; userId: string; status: JobPostingStatus };

/** States from which the owner may paste text or reprocess. */
const SETTLED: JobPostingStatus[] = ["FAILED", "READY"];
/** Reset of everything a previous pass produced (the tailored CV row stays until it is replaced). */
const CLEARED_EXTRACTION = {
  failureReason: null,
  extracted: Prisma.DbNull,
  droppedRequirementCount: null,
  injectionSuspected: false,
  injectionEvidence: null,
  generation: Prisma.DbNull,
};

/**
 * Job postings repository, API side (career module, spec 2026-10-22 §5–7): batches, list and detail, pasted
 * text, reprocessing, deletion, and the periodic sweep. Every transition is conditional on the expected
 * status and enqueues its job in the same transaction (ADR-0002 §3); the worker side is
 * `PrismaJobPostingStore`. URLs and posting text are the owner's data: never logged nor audited.
 */
export class PrismaJobPostings {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * Creates a batch with one `FETCHING` posting per distinct normalized link and enqueues one `job.fetch`
   * each, all in one transaction: a queue failure leaves neither batch, postings nor jobs. `urls` are
   * already validated (contract); duplicates merge in request order.
   */
  async createBatch(
    userId: string,
    urls: readonly string[],
    meta: CareerAuditMeta,
    enqueueFetch: JobFetchEnqueue,
  ): Promise<CreatedBatch> {
    const distinct = new Map<string, string>();
    const tooLong: number[] = [];
    urls.forEach((raw, index) => {
      const url = normalizeJobPostingUrl(raw);
      if (url.length > JOB_POSTING_URL_MAX_CHARS) tooLong.push(index + 1);
      const hash = jobPostingUrlHash(url);
      if (!distinct.has(hash)) distinct.set(hash, url);
    });
    if (distinct.size === 0 || urls.length > TAILORING_BATCH_MAX_LINKS) {
      throw new RangeError(`A batch has 1 to ${TAILORING_BATCH_MAX_LINKS} links`);
    }
    if (tooLong.length > 0) throw new JobPostingUrlTooLongError(tooLong);
    const now = this.now();
    return this.prisma.$transaction(async (tx) => {
      await lockOwner(tx, userId);
      const active = await tx.cvBase.findFirst({
        where: { userId, isActive: true },
        select: { id: true },
      });
      if (!active) throw new CvBaseRequiredError();
      const batchId = newId();
      await tx.tailoringBatch.create({
        data: { id: batchId, userId, cvBaseId: active.id, createdAt: now },
      });
      const postings: JobPostingSummaryRecord[] = [];
      const jobIds: string[] = [];
      let blocked = 0;
      for (const [urlHash, url] of distinct) {
        const fetchable = isFetchableJobPostingUrl(url);
        const row = await tx.jobPosting.create({
          data: {
            id: newId(),
            userId,
            batchId,
            url,
            urlHash,
            source: jobPostingSourceOf(url),
            // ADR-0008 §1: never a fetch (nor quota) for a LinkedIn page that is not a job view.
            ...(fetchable
              ? { status: "FETCHING" as const }
              : { status: "FAILED" as const, failureReason: "FETCH_BLOCKED" as const }),
            createdAt: now,
            updatedAt: now,
          },
        });
        postings.push(toSummary(row, null));
        if (!fetchable) {
          blocked += 1;
          continue;
        }
        jobIds.push(
          await enqueueFetch(sqlExecutor(tx), {
            jobPostingId: row.id,
            attempt: row.attempt,
            groupId: jobFetchGroupId(url),
          }),
        );
      }
      const duplicatesMerged = urls.length - distinct.size;
      await audit(tx, userId, meta, "tailoring_batch.created", "tailoring_batch", batchId, {
        before: null,
        after: { cvBaseId: active.id, postings: postings.length, duplicatesMerged, blocked },
      });
      return { batchId, cvBaseId: active.id, postings, jobIds, duplicatesMerged, blocked };
    });
  }

  /** Newest first (uuid v7 ids are time-ordered); `cursor` is the last id of the previous page. */
  async list(
    userId: string,
    page: { limit: number; cursor?: string | undefined },
  ): Promise<{ items: JobPostingSummaryRecord[]; nextCursor: string | null }> {
    const rows = await this.prisma.jobPosting.findMany({
      where: { userId, ...(page.cursor === undefined ? {} : { id: { lt: page.cursor } }) },
      include: { tailoredCv: { select: { matchReport: true } } },
      orderBy: { id: "desc" },
      take: page.limit + 1,
    });
    const items: JobPostingSummaryRecord[] = [];
    for (const row of rows.slice(0, page.limit)) {
      const settled = await this.settleStale(row);
      items.push(
        toSummary(settled, settled === row ? (row.tailoredCv?.matchReport ?? null) : null),
      );
    }
    return {
      items,
      nextCursor: rows.length > page.limit ? (rows[page.limit - 1]?.id ?? null) : null,
    };
  }

  async get(userId: string, id: string): Promise<JobPostingRecord> {
    const found = await this.prisma.jobPosting.findFirst({ where: { id, userId } });
    if (!found) throw new JobPostingNotFoundError();
    const row = await this.settleStale(found);
    if (row.status !== "READY") return toRecord(row, null, null);
    const [tailored, active] = await Promise.all([
      this.prisma.tailoredCv.findUnique({ where: { jobPostingId: row.id } }),
      this.prisma.cvBase.findFirst({ where: { userId, isActive: true }, select: { id: true } }),
    ]);
    return toRecord(row, tailored, active?.id ?? null);
  }

  /**
   * The owner pasted the posting text (a link that did not open, or a better text): the posting restarts
   * as `PASTED` from `FETCHING` and `job.fetch` (group `pasted`) extracts it without touching any site.
   */
  async pasteText(
    userId: string,
    id: string,
    text: string,
    meta: CareerAuditMeta,
    enqueueFetch: JobFetchEnqueue,
  ): Promise<{ posting: JobPostingSummaryRecord; jobId: string }> {
    const pageText = boundedText(text);
    if (pageText === null) throw new RangeError("Pasted posting text is empty");
    return this.restart(userId, id, meta, "job_posting.text_pasted", async (tx, row) => {
      const updated = await tx.jobPosting.update({
        where: { id: row.id },
        data: {
          ...CLEARED_EXTRACTION,
          status: "FETCHING",
          source: "PASTED",
          pageText,
          fetchedAt: null,
          attempt: { increment: 1 },
          updatedAt: this.now(),
        },
      });
      const jobId = await enqueueFetch(sqlExecutor(tx), {
        jobPostingId: row.id,
        attempt: updated.attempt,
        groupId: JOB_FETCH_PASTED_GROUP,
      });
      return { updated, jobId };
    });
  }

  /**
   * Reprocesses a `FAILED` or `READY` posting from the furthest step its data allows: with the extraction
   * and the text, only `cv.tailor` runs again (`ANALYZING`); otherwise `job.fetch` (`FETCHING`) re-reads the
   * kept text, or fetches the link again when the text is gone (the worker applies the breaker, ADR-0008).
   */
  async retry(
    userId: string,
    id: string,
    meta: CareerAuditMeta,
    enqueue: { fetch: JobFetchEnqueue; tailor: CvTailorEnqueue },
  ): Promise<{ posting: JobPostingSummaryRecord; jobId: string }> {
    return this.restart(userId, id, meta, "job_posting.retried", async (tx, row) => {
      const now = this.now();
      if (row.extracted !== null && row.pageText !== null) {
        const updated = await tx.jobPosting.update({
          where: { id: row.id },
          data: {
            status: "ANALYZING",
            failureReason: null,
            attempt: { increment: 1 },
            updatedAt: now,
          },
        });
        const job = { jobPostingId: row.id, attempt: updated.attempt };
        return { updated, jobId: await enqueue.tailor(sqlExecutor(tx), job) };
      }
      // A pasted posting whose text expired falls back to its link, if the link may be fetched at all.
      if (row.pageText === null && !isFetchableJobPostingUrl(row.url)) {
        throw new JobPostingTextRequiredError();
      }
      const source =
        row.source === "PASTED" && row.pageText === null ? jobPostingSourceOf(row.url) : row.source;
      const updated = await tx.jobPosting.update({
        where: { id: row.id },
        data: {
          ...CLEARED_EXTRACTION,
          status: "FETCHING",
          source,
          attempt: { increment: 1 },
          updatedAt: now,
        },
      });
      const groupId = source === "PASTED" ? JOB_FETCH_PASTED_GROUP : jobFetchGroupId(row.url);
      const job = { jobPostingId: row.id, attempt: updated.attempt, groupId };
      return { updated, jobId: await enqueue.fetch(sqlExecutor(tx), job) };
    });
  }

  /**
   * Deletes the posting and its tailored CV (owner's request; personal data), whatever its status: a job
   * still queued for it exits quietly. The batch goes with its last posting.
   */
  async delete(userId: string, id: string, meta: CareerAuditMeta): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.jobPosting.findFirst({
        where: { id, userId },
        select: { id: true, batchId: true, status: true },
      });
      if (!row) throw new JobPostingNotFoundError();
      // Concurrent deletions of a batch's last postings serialize on the batch row: otherwise each one
      // would still count the other's posting and the empty batch would stay behind.
      const batch = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "tailoring_batches" WHERE "id" = ${row.batchId}::uuid FOR UPDATE`;
      if (batch.length === 0) throw new JobPostingNotFoundError();
      const { count } = await tx.jobPosting.deleteMany({ where: { id: row.id, userId } });
      if (count === 0) throw new JobPostingNotFoundError();
      const remaining = await tx.jobPosting.count({ where: { batchId: row.batchId } });
      if (remaining === 0) await tx.tailoringBatch.delete({ where: { id: row.batchId } });
      await audit(tx, userId, meta, "job_posting.deleted", "job_posting", row.id, {
        before: { status: row.status },
        after: { batchDeleted: String(remaining === 0) },
      });
    });
  }

  /**
   * Periodic sweep (Sentinela S-2 pattern): postings stuck past `JOB_POSTING_STALE_MS` become
   * `FAILED`/`TIMED_OUT`, then the page text of postings `FAILED` for longer than
   * `JOB_POSTING_FAILED_TEXT_RETENTION_MS` is erased. No long interactive transaction (QA #101): each stale
   * posting is settled in its own short one (conditional, so a posting that moved on meanwhile is left
   * alone, and a row locked by a concurrent writer is skipped until the next sweep), and the erasure is a
   * single bounded statement. The cutoffs are bound from the application clock (never SQL `now()`).
   */
  async sweep(
    batchSize = JOB_POSTING_SWEEP_BATCH,
  ): Promise<{ timedOut: number; textErased: number }> {
    const now = this.now().getTime();
    const fetchingCutoff = new Date(now - JOB_POSTING_STALE_MS.FETCHING);
    const analyzingCutoff = new Date(now - JOB_POSTING_STALE_MS.ANALYZING);
    const retentionCutoff = new Date(now - JOB_POSTING_FAILED_TEXT_RETENTION_MS);
    const stale = await this.prisma.$queryRaw<StalePosting[]>`
      SELECT "id", "user_id" AS "userId", "status"::text AS "status" FROM "job_postings"
      WHERE ("status" = 'FETCHING' AND "updated_at" < ${fetchingCutoff})
         OR ("status" = 'ANALYZING' AND "updated_at" < ${analyzingCutoff})
      ORDER BY "updated_at" LIMIT ${batchSize}`;
    let timedOut = 0;
    for (const posting of stale) {
      const settled = await this.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "job_postings" WHERE "id" = ${posting.id}::uuid FOR UPDATE SKIP LOCKED`;
        return locked.length > 0 && this.timeOut(tx, posting);
      });
      if (settled) timedOut += 1;
    }
    const textErased = await this.prisma.$executeRaw`
      UPDATE "job_postings" SET "page_text" = NULL
      WHERE "id" IN (
        SELECT "id" FROM "job_postings"
        WHERE "status" = 'FAILED' AND "page_text" IS NOT NULL AND "updated_at" < ${retentionCutoff}
        ORDER BY "updated_at" LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED)`;
    return { timedOut, textErased };
  }

  /** Locks the posting, checks it may restart, runs `apply` and audits, in one transaction. */
  private async restart(
    userId: string,
    id: string,
    meta: CareerAuditMeta,
    action: string,
    apply: (tx: Transaction, row: PostingRow) => Promise<{ updated: PostingRow; jobId: string }>,
  ): Promise<{ posting: JobPostingSummaryRecord; jobId: string }> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "job_postings" WHERE "id" = ${id}::uuid AND "user_id" = ${userId}::uuid
        FOR UPDATE`;
      if (locked.length === 0) throw new JobPostingNotFoundError();
      const row = await tx.jobPosting.findUniqueOrThrow({ where: { id } });
      if (!SETTLED.includes(row.status)) throw new JobPostingBusyError(row.status);
      const { updated, jobId } = await apply(tx, row);
      await audit(tx, userId, meta, action, "job_posting", id, {
        before: {
          status: row.status,
          ...(row.failureReason === null ? {} : { failureReason: row.failureReason }),
        },
        after: { status: updated.status, source: updated.source, attempt: updated.attempt },
      });
      return { posting: toSummary(updated, null), jobId };
    });
  }

  private async settleStale<R extends PostingRow>(row: R): Promise<R | PostingRow> {
    if (row.status !== "FETCHING" && row.status !== "ANALYZING") return row;
    const cutoff = this.now().getTime() - JOB_POSTING_STALE_MS[row.status];
    if (row.updatedAt.getTime() >= cutoff) return row;
    await this.prisma.$transaction((tx) => this.timeOut(tx, row));
    return (await this.prisma.jobPosting.findUnique({ where: { id: row.id } })) ?? row;
  }

  /** Conditional: a posting that moved on (or was touched within its window) is left alone. */
  private async timeOut(tx: Transaction, posting: StalePosting): Promise<boolean> {
    if (posting.status !== "FETCHING" && posting.status !== "ANALYZING") return false;
    const cutoff = new Date(this.now().getTime() - JOB_POSTING_STALE_MS[posting.status]);
    const { count } = await tx.jobPosting.updateMany({
      where: { id: posting.id, status: posting.status, updatedAt: { lt: cutoff } },
      data: { status: "FAILED", failureReason: "TIMED_OUT", updatedAt: this.now() },
    });
    if (count === 0) return false;
    await tx.auditEvent.create({
      data: {
        id: newId(),
        userId: posting.userId,
        actorType: "SYSTEM",
        action: "job_posting.failed",
        entityType: "job_posting",
        entityId: posting.id,
        before: { status: posting.status },
        after: { status: "FAILED", failureReason: "TIMED_OUT" },
        correlationId: `job_posting:${posting.id}`,
      },
    });
    return true;
  }
}

/** Posting text cut to the stored bound by code point (as PostgreSQL's `char_length`); null when empty. */
export function boundedText(text: string): string | null {
  // PostgreSQL text cannot hold NUL.
  const cleaned = text.replaceAll("\u0000", "");
  if (cleaned.trim() === "") return null;
  return Array.from(cleaned).slice(0, JOB_POSTING_TEXT_MAX_CHARS).join("");
}

export async function audit(
  tx: Transaction,
  userId: string,
  meta: CareerAuditMeta,
  action: string,
  entityType: "job_posting" | "tailoring_batch",
  entityId: string,
  snapshot: {
    before: Record<string, string | number> | null;
    after: Record<string, string | number>;
  },
): Promise<void> {
  await tx.auditEvent.create({
    data: {
      id: newId(),
      userId,
      actorType: meta.actor.type,
      actorId: meta.actor.type === "USER" ? meta.actor.userId : meta.actor.jobId,
      action,
      entityType,
      entityId,
      ...(snapshot.before === null ? {} : { before: snapshot.before }),
      after: snapshot.after,
      correlationId: meta.correlationId,
    },
  });
}

function toSummary(row: PostingRow, matchReport: Prisma.JsonValue | null): JobPostingSummaryRecord {
  const extracted = row.extracted === null ? null : JobPostingExtractedSchema.parse(row.extracted);
  const baseScore =
    row.status === "READY" && matchReport !== null
      ? MatchReportSchema.parse(matchReport).baseScore
      : null;
  return {
    id: row.id,
    batchId: row.batchId,
    url: row.url,
    source: row.source,
    status: row.status,
    failureReason: row.failureReason,
    title: extracted?.title ?? null,
    company: extracted?.company ?? null,
    baseScore,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toRecord(
  row: PostingRow,
  tailored: TailoredRow | null,
  activeCvBaseId: string | null,
): JobPostingRecord {
  const tailoring =
    row.status === "READY" && tailored !== null
      ? {
          cvBaseId: tailored.cvBaseId,
          generatedWithPreviousCv: tailored.cvBaseId !== activeCvBaseId,
          content: TailoredCvContentSchema.parse(tailored.content),
          report: MatchReportSchema.parse(tailored.matchReport),
          generation: tailored.generation as unknown as GenerationInfo,
          generatedAt: tailored.updatedAt,
        }
      : null;
  return {
    ...toSummary(row, tailored?.matchReport ?? null),
    extracted: row.extracted === null ? null : JobPostingExtractedSchema.parse(row.extracted),
    droppedRequirementCount: row.droppedRequirementCount,
    injectionSuspected: row.injectionSuspected,
    injectionEvidence: row.injectionEvidence,
    fetchedAt: row.fetchedAt,
    tailoring,
  };
}
