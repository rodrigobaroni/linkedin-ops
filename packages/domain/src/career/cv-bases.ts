import {
  ParseWarningSchema,
  QUEUES,
  type CvDraftStatus,
  type CvExtractionFailure,
  type ParseWarning,
} from "@linkedin-ops/contracts";
import type { PrismaClient } from "../client.js";
import type { Prisma } from "../generated/prisma/client.js";
import { newId } from "../ids.js";
import type { CareerFailureReason, GenerationInfo } from "./ports.js";

type Transaction = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
type CvBaseRow = Awaited<ReturnType<PrismaClient["cvBase"]["findUniqueOrThrow"]>>;
type StaleDraft = Pick<CvBaseRow, "id" | "userId" | "version">;

const CV_EXTRACT_QUEUE = QUEUES["cv.extract"];

/**
 * A draft still `EXTRACTING` after every `cv.extract` attempt could have expired (plus 10 min of backoff and
 * queue latency) was lost by the queue: it becomes `FAILED`/`TIMED_OUT` the next time it is read, so the
 * owner can upload again instead of waiting forever.
 */
export const CV_EXTRACTION_STALE_MS =
  (CV_EXTRACT_QUEUE.retryLimit + 1) * CV_EXTRACT_QUEUE.expireInSeconds * 1000 + 10 * 60 * 1000;

/** Drafts settled per sweep; the rest waits for the next tick (every 5 min). */
export const CV_EXTRACTION_SWEEP_BATCH = 50;

/** Longest injection excerpt kept with a draft (`cv_bases_injection_evidence_check`). */
export const CV_INJECTION_EVIDENCE_MAX_CHARS = 500;

/**
 * Runs one SQL statement on the caller's connection. `startDraft` hands its transaction to the enqueue
 * callback through this shape, which is what pg-boss accepts as `send(..., { db })`: the job row commits
 * or rolls back with the draft (ADR-0002 §3). The domain never depends on pg-boss itself.
 */
export interface SqlExecutor {
  executeSql(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

/** Enqueues the draft's `cv.extract` on `db` (the draft's transaction) and returns the job id. */
export type CvExtractEnqueue = (db: SqlExecutor, draftId: string) => Promise<string>;

/** Validates structured CV content on every write and read (the schema lives in `packages/contracts`). */
export type CvContentParser<C> = (value: unknown) => C;

export interface CvDraftRecord<C> {
  id: string;
  version: number;
  status: CvDraftStatus;
  failureReason: CvExtractionFailure | null;
  content: C | null;
  /** Empty until `READY`. */
  parseWarnings: ParseWarning[];
  injectionSuspected: boolean;
  /** CV content: shown to the owner only, never logged nor audited. */
  injectionEvidence: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** What `cv.extract` produced for a draft. */
export interface CvExtraction<C> {
  content: C;
  parseWarnings: ParseWarning[];
  injectionSuspected: boolean;
  injectionEvidence: string | null;
  generation: GenerationInfo;
}

export interface CvBaseRecord<C> {
  id: string;
  version: number;
  content: C;
  confirmedAt: Date;
  createdAt: Date;
}

export interface CvBaseState<C> {
  active: CvBaseRecord<C> | null;
  draft: CvDraftRecord<C> | null;
}

/** Who acted, for the audit trail. Audit snapshots carry ids, versions and statuses, never CV content. */
export interface CvAuditMeta {
  correlationId: string;
  actor: { type: "USER"; userId: string } | { type: "WORKER"; jobId: string };
}

/** `confirm` without a `READY` draft of that id (none, replaced meanwhile, still extracting, failed). */
export class CvDraftNotReadyError extends Error {
  constructor(readonly draftStatus: CvDraftStatus | null) {
    super(draftStatus === null ? "No pending CV draft with this id" : `CV draft is ${draftStatus}`);
    this.name = "CvDraftNotReadyError";
  }
}

/**
 * `confirm` of a draft whose extraction flagged instructions in the CV text without the owner's explicit
 * acknowledgement (ADR-0005 §4: fail closed).
 */
export class CvInjectionUnacknowledgedError extends Error {
  constructor() {
    super("CV draft flagged as possible prompt injection; confirmation must acknowledge it");
    this.name = "CvInjectionUnacknowledgedError";
  }
}

/**
 * CV base repository (career module, spec 2026-10-22 §5–6). Version allocation, draft replacement and
 * activation run under a lock on the owner's `users` row, so concurrent uploads and confirmations serialize;
 * the partial unique indexes (one draft, one active version) back this up in the database.
 */
export class PrismaCvBases<C> {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly parseContent: CvContentParser<C>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async state(userId: string): Promise<CvBaseState<C>> {
    const rows = await this.prisma.cvBase.findMany({
      where: { userId, OR: [{ isActive: true }, { confirmedAt: null }] },
    });
    const active = rows.find((row) => row.isActive);
    let draft = rows.find((row) => row.confirmedAt === null);
    if (draft) draft = await this.settleStale(draft);
    return {
      active: active ? this.toBase(active) : null,
      draft: draft ? this.toDraft(draft) : null,
    };
  }

  /**
   * Stores the PDF text as a new `EXTRACTING` draft, replacing any pending draft, and enqueues its
   * `cv.extract` in the same transaction: if `enqueue` throws, neither the draft nor the job exist.
   */
  async startDraft(
    userId: string,
    extractedText: string,
    meta: CvAuditMeta,
    enqueue: CvExtractEnqueue,
  ): Promise<{ draft: CvDraftRecord<C>; jobId: string }> {
    const now = this.now();
    return this.prisma.$transaction(async (tx) => {
      await lockOwner(tx, userId);
      const replaced = await tx.cvBase.findFirst({
        where: { userId, confirmedAt: null },
        select: { id: true, version: true },
      });
      if (replaced) await tx.cvBase.delete({ where: { id: replaced.id } });
      const latest = await tx.cvBase.aggregate({ where: { userId }, _max: { version: true } });
      const row = await tx.cvBase.create({
        data: {
          id: newId(),
          userId,
          version: (latest._max.version ?? 0) + 1,
          status: "EXTRACTING",
          extractedText,
          createdAt: now,
          updatedAt: now,
        },
      });
      await audit(tx, userId, meta, "cv_base.draft_started", row.id, {
        before: replaced ? { replacedDraftId: replaced.id, version: replaced.version } : null,
        after: { status: row.status, version: row.version },
      });
      const jobId = await enqueue(sqlExecutor(tx), row.id);
      return { draft: this.toDraft(row), jobId };
    });
  }

  /** Input of `cv.extract`: the text of a draft still `EXTRACTING` (null once it left that state). */
  async extractionInput(cvBaseId: string): Promise<{ userId: string; text: string } | null> {
    const row = await this.prisma.cvBase.findFirst({
      where: { id: cvBaseId, status: "EXTRACTING" },
      select: { userId: true, extractedText: true },
    });
    return row?.extractedText ? { userId: row.userId, text: row.extractedText } : null;
  }

  /**
   * `cv.extract` succeeded: the draft becomes `READY` with the extraction and the PDF text is erased, in
   * one conditional update. False = no longer pending (duplicated or late job).
   */
  async completeExtraction(
    cvBaseId: string,
    extraction: CvExtraction<C>,
    meta: CvAuditMeta,
  ): Promise<boolean> {
    const valid = this.parseContent(extraction.content);
    const parseWarnings = ParseWarningSchema.array().parse(extraction.parseWarnings);
    // Cut by code point, as PostgreSQL's `char_length` counts (never splits a surrogate pair).
    const evidence = extraction.injectionSuspected
      ? Array.from(extraction.injectionEvidence ?? "")
          .slice(0, CV_INJECTION_EVIDENCE_MAX_CHARS)
          .join("") || null
      : null;
    return this.leaveExtracting(
      cvBaseId,
      meta,
      "cv_base.extraction_ready",
      {
        status: "READY",
        content: valid as Prisma.InputJsonValue,
        parseWarnings: parseWarnings as Prisma.InputJsonValue,
        injectionSuspected: extraction.injectionSuspected,
        injectionEvidence: evidence,
        generation: { ...extraction.generation } as Prisma.InputJsonValue,
      },
      {
        parseWarnings: parseWarnings.length,
        injectionSuspected: String(extraction.injectionSuspected),
      },
    );
  }

  /**
   * `cv.extract` gave up: the draft becomes `FAILED` and the PDF text is erased. `cause` (the worker's
   * detailed reason) goes to the audit trail only.
   */
  async failExtraction(
    cvBaseId: string,
    reason: CvExtractionFailure,
    meta: CvAuditMeta,
    cause?: CareerFailureReason,
  ): Promise<boolean> {
    return this.leaveExtracting(
      cvBaseId,
      meta,
      "cv_base.extraction_failed",
      { status: "FAILED", failureReason: reason },
      cause === undefined ? {} : { cause },
    );
  }

  /**
   * Activates the reviewed `READY` draft with the owner's edits; the previous version is deactivated. A
   * draft flagged `injectionSuspected` needs `acknowledgeInjection` (fail closed, ADR-0005 §4).
   */
  async confirm(
    userId: string,
    draftId: string,
    content: C,
    meta: CvAuditMeta,
    options: { acknowledgeInjection?: boolean } = {},
  ): Promise<CvBaseRecord<C>> {
    const valid = this.parseContent(content);
    const now = this.now();
    return this.prisma.$transaction(async (tx) => {
      await lockOwner(tx, userId);
      const draft = await tx.cvBase.findFirst({
        where: { id: draftId, userId, confirmedAt: null },
      });
      if (!draft) throw new CvDraftNotReadyError(null);
      if (draft.status !== "READY") throw new CvDraftNotReadyError(draft.status);
      if (draft.injectionSuspected && options.acknowledgeInjection !== true) {
        throw new CvInjectionUnacknowledgedError();
      }
      const previous = await tx.cvBase.findFirst({
        where: { userId, isActive: true },
        select: { id: true, version: true },
      });
      if (previous) {
        await tx.cvBase.update({
          where: { id: previous.id },
          data: { isActive: false, updatedAt: now },
        });
      }
      const row = await tx.cvBase.update({
        where: { id: draft.id },
        data: {
          content: valid as Prisma.InputJsonValue,
          isActive: true,
          confirmedAt: now,
          updatedAt: now,
        },
      });
      await audit(tx, userId, meta, "cv_base.confirmed", row.id, {
        before: previous ? { activeId: previous.id, version: previous.version } : null,
        after: {
          activeId: row.id,
          version: row.version,
          ...(draft.injectionSuspected ? { injectionAcknowledged: "true" } : {}),
        },
      });
      return this.toBase(row);
    });
  }

  /** Deletes every version and the draft (owner's request; personal data). Returns how many rows went. */
  async deleteAll(userId: string, meta: CvAuditMeta): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      await lockOwner(tx, userId);
      const { count } = await tx.cvBase.deleteMany({ where: { userId } });
      if (count > 0) {
        await audit(tx, userId, meta, "cv_base.deleted", null, {
          before: null,
          after: { deletedVersions: count },
        });
      }
      return count;
    });
  }

  private async leaveExtracting(
    cvBaseId: string,
    meta: CvAuditMeta,
    action: string,
    data:
      | {
          status: "READY";
          content: Prisma.InputJsonValue;
          parseWarnings: Prisma.InputJsonValue;
          injectionSuspected: boolean;
          injectionEvidence: string | null;
          generation: Prisma.InputJsonValue;
        }
      | {
          status: "FAILED";
          failureReason: CvExtractionFailure;
        },
    auditDetail: Record<string, string | number>,
  ): Promise<boolean> {
    const now = this.now();
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.cvBase.findUnique({
        where: { id: cvBaseId },
        select: { userId: true, version: true },
      });
      if (!row) return false;
      const { count } = await tx.cvBase.updateMany({
        where: { id: cvBaseId, status: "EXTRACTING" },
        data: { ...data, extractedText: null, updatedAt: now },
      });
      if (count === 0) return false;
      await audit(tx, row.userId, meta, action, cvBaseId, {
        before: { status: "EXTRACTING" },
        after: {
          status: data.status,
          version: row.version,
          ...(data.status === "FAILED" ? { failureReason: data.failureReason } : {}),
          ...auditDetail,
        },
      });
      return true;
    });
  }

  /**
   * Periodic sweep (Sentinela S-2), independent of reads: every draft still `EXTRACTING` past
   * `CV_EXTRACTION_STALE_MS` becomes `FAILED`/`TIMED_OUT` and its PDF text is erased. No long interactive
   * transaction (QA #101): candidates are read without a lock and each draft is settled in its own short
   * transaction (conditional, so a draft that moved on meanwhile is left alone; a row locked by a concurrent
   * writer is skipped until the next sweep). Returns how many drafts were settled.
   */
  async settleStaleExtractions(batchSize = CV_EXTRACTION_SWEEP_BATCH): Promise<number> {
    const cutoff = new Date(this.now().getTime() - CV_EXTRACTION_STALE_MS);
    // The cutoff is bound from the application clock (never SQL `now()`).
    const stale = await this.prisma.$queryRaw<StaleDraft[]>`
      SELECT "id", "user_id" AS "userId", "version" FROM "cv_bases"
      WHERE "status" = 'EXTRACTING' AND "updated_at" < ${cutoff}
      ORDER BY "updated_at" LIMIT ${batchSize}`;
    let settled = 0;
    for (const draft of stale) {
      const done = await this.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "cv_bases" WHERE "id" = ${draft.id}::uuid FOR UPDATE SKIP LOCKED`;
        return locked.length > 0 && this.settleOne(tx, draft, cutoff);
      });
      if (done) settled += 1;
    }
    return settled;
  }

  private async settleStale(row: CvBaseRow): Promise<CvBaseRow> {
    const cutoff = new Date(this.now().getTime() - CV_EXTRACTION_STALE_MS);
    if (row.status !== "EXTRACTING" || row.updatedAt >= cutoff) return row;
    await this.prisma.$transaction((tx) => this.settleOne(tx, row, cutoff));
    return (await this.prisma.cvBase.findUnique({ where: { id: row.id } })) ?? row;
  }

  /** Conditional: a draft that left `EXTRACTING` or was touched after `cutoff` is left alone. */
  private async settleOne(tx: Transaction, draft: StaleDraft, cutoff: Date): Promise<boolean> {
    const { count } = await tx.cvBase.updateMany({
      where: { id: draft.id, status: "EXTRACTING", updatedAt: { lt: cutoff } },
      data: {
        status: "FAILED",
        failureReason: "TIMED_OUT",
        extractedText: null,
        updatedAt: this.now(),
      },
    });
    if (count === 0) return false;
    await tx.auditEvent.create({
      data: {
        id: newId(),
        userId: draft.userId,
        actorType: "SYSTEM",
        action: "cv_base.extraction_failed",
        entityType: "cv_base",
        entityId: draft.id,
        before: { status: "EXTRACTING" },
        after: { status: "FAILED", version: draft.version, failureReason: "TIMED_OUT" },
        correlationId: `cv_base:${draft.id}`,
      },
    });
    return true;
  }

  private toDraft(row: CvBaseRow): CvDraftRecord<C> {
    return {
      id: row.id,
      version: row.version,
      status: row.status,
      failureReason: row.failureReason,
      content: row.content === null ? null : this.parseContent(row.content),
      parseWarnings:
        row.parseWarnings === null ? [] : ParseWarningSchema.array().parse(row.parseWarnings),
      injectionSuspected: row.injectionSuspected,
      injectionEvidence: row.injectionEvidence,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toBase(row: CvBaseRow): CvBaseRecord<C> {
    if (row.confirmedAt === null || row.content === null) {
      throw new Error(`cv_bases ${row.id} is active without confirmation or content`);
    }
    return {
      id: row.id,
      version: row.version,
      content: this.parseContent(row.content),
      confirmedAt: row.confirmedAt,
      createdAt: row.createdAt,
    };
  }
}

/** Lets a statement built elsewhere (pg-boss) run inside a Prisma interactive transaction. */
function sqlExecutor(tx: Transaction): SqlExecutor {
  return {
    executeSql: async (text, values = []) => ({
      rows: await tx.$queryRawUnsafe<unknown[]>(text, ...values),
    }),
  };
}

/** Serializes CV base writes of one owner (row lock on `users`, released at commit). */
async function lockOwner(tx: Transaction, userId: string): Promise<void> {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "users" WHERE "id" = ${userId}::uuid FOR UPDATE`;
  if (locked.length === 0) throw new Error("CV base owner does not exist");
}

async function audit(
  tx: Transaction,
  userId: string,
  meta: CvAuditMeta,
  action: string,
  entityId: string | null,
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
      entityType: "cv_base",
      entityId,
      ...(snapshot.before === null ? {} : { before: snapshot.before }),
      after: snapshot.after,
      correlationId: meta.correlationId,
    },
  });
}
