import { Inject, Injectable } from "@nestjs/common";
import type {
  JobPostingAccepted,
  JobPostingDetail,
  JobPostingListQuery,
  JobPostingSummary,
  Page,
  TailoringBatchAccepted,
  TailoringBatchInput,
} from "@linkedin-ops/contracts";
import {
  CvBaseRequiredError,
  JobPostingBusyError,
  JobPostingNotFoundError,
  JobPostingTextRequiredError,
  JobPostingUrlTooLongError,
  TailoredCvNotReadyError,
  TailoredCvStaleError,
  type CareerAuditMeta,
  type CvTailorEnqueue,
  type JobFetchEnqueue,
  type JobPostingRecord,
  type JobPostingSummaryRecord,
  type PrismaJobPostings,
} from "@linkedin-ops/domain";
import type { Logger } from "pino";
import { ProblemError } from "../common/problem.error.js";
import { FixedWindowLimiter } from "../linkedin/fixed-window-limiter.js";
import { API_LOGGER } from "../logging/logger.js";
import type { AuthenticatedSession } from "../session/session.service.js";
import { CAREER_RATE_LIMITS, type CareerRateLimits } from "./cv-base.service.js";
import { JOB_POSTING_QUEUE, type JobPostingQueue } from "./career.queue.js";
import { cvPdfFileName } from "./pdf/cv-pdf-file-name.js";
import {
  TailoredCvRenderError,
  TailoredCvTooLargeError,
  renderTailoredCvPdf,
} from "./pdf/tailored-cv.pdf.js";

export const JOB_POSTINGS = Symbol("JOB_POSTINGS");

const QUEUE_UNAVAILABLE = "Não foi possível iniciar o processamento das vagas; tente de novo";
const BUSY = "Esta vaga ainda está sendo processada; aguarde o fim para reprocessar";
const STALE = "O CV adaptado referencia itens que não existem mais no CV base; reprocesse a vaga";

/** A rendered tailored CV: `fileName` is ASCII letters, digits and hyphens plus `.pdf` (header-safe). */
export interface TailoredCvPdf {
  fileName: string;
  body: Buffer;
}

/**
 * Batches and job postings of the career module (spec 2026-10-22 §5 and §7, PR 3b). The API validates,
 * normalizes and stores; the worker fetches, extracts and tailors (`job.fetch`, `cv.tailor`, the only place
 * with model credentials and outbound fetches, ADR-0002/ADR-0008). Every enqueue rides the transaction of
 * the state change. URLs, posting text and CV content are personal data: they never reach logs, audit
 * snapshots or Problem Details.
 */
@Injectable()
export class JobPostingService {
  readonly #batchLimiter: FixedWindowLimiter;
  readonly #reprocessLimiter: FixedWindowLimiter;
  readonly #pdfLimiter: FixedWindowLimiter;

  constructor(
    @Inject(JOB_POSTINGS) private readonly postings: PrismaJobPostings,
    @Inject(JOB_POSTING_QUEUE) private readonly queue: JobPostingQueue,
    @Inject(CAREER_RATE_LIMITS) limits: CareerRateLimits,
    @Inject(API_LOGGER) private readonly logger: Logger,
  ) {
    this.#batchLimiter = new FixedWindowLimiter(limits.batchPerUser, limits.windowMs);
    this.#reprocessLimiter = new FixedWindowLimiter(limits.reprocessPerUser, limits.windowMs);
    this.#pdfLimiter = new FixedWindowLimiter(limits.pdfPerUser, limits.windowMs);
  }

  async createBatch(
    session: AuthenticatedSession,
    input: TailoringBatchInput,
    correlationId: string,
  ): Promise<TailoringBatchAccepted> {
    this.#batchLimiter.consume(session.userId, "Muitos lotes de vagas; tente de novo mais tarde");
    await this.ensureReady();
    try {
      const created = await this.postings.createBatch(
        session.userId,
        input.urls,
        userMeta(session, correlationId),
        this.fetchEnqueue(session, correlationId),
      );
      const firstJobId = created.jobIds[0] ?? null;
      return {
        id: created.batchId,
        status: firstJobId === null ? "FAILED" : "FETCHING",
        jobId: firstJobId,
        batchId: created.batchId,
        cvBaseId: created.cvBaseId,
        duplicatesMerged: created.duplicatesMerged,
        blocked: created.blocked,
        postings: created.postings.map(toSummary),
        jobIds: created.jobIds,
      };
    } catch (error) {
      if (error instanceof JobPostingUrlTooLongError) {
        // Positions only: the links are the owner's data.
        throw new ProblemError("JOB_POSTING_URL_REJECTED", {
          detail: `Link longo demais depois de normalizado (posição ${error.positions.join(", ")}); envie o link curto da vaga`,
        });
      }
      if (error instanceof CvBaseRequiredError) {
        throw new ProblemError("CV_BASE_REQUIRED", {
          detail: "Envie e confirme seu CV em Meu CV antes de enviar vagas",
        });
      }
      throw this.mapEnqueueError(error, "job.fetch", correlationId);
    }
  }

  async list(userId: string, query: JobPostingListQuery): Promise<Page<JobPostingSummary>> {
    const page = await this.postings.list(userId, query);
    return { items: page.items.map(toSummary), nextCursor: page.nextCursor };
  }

  async get(userId: string, id: string): Promise<JobPostingDetail> {
    try {
      return toDetail(await this.postings.get(userId, id));
    } catch (error) {
      throw mapPostingError(error);
    }
  }

  /**
   * Renders the tailored CV on demand (spec §5 item 7) from the CV base version it was tailored from
   * (`tailored_cvs.cv_base_id`, never the active one). Only `READY` postings; another owner's posting is a
   * `404`. Nothing of the CV reaches logs, audit or Problem Details: a stale reference audits its id only.
   * The rate limit counts renders and stale refusals: it is consumed once ownership and status checked out,
   * so probing other ids (cheap, always `404`) never spends the owner's quota, and before any stale audit
   * event is written, so repeated downloads of a stale CV cannot flood the audit trail.
   */
  async pdf(
    session: AuthenticatedSession,
    id: string,
    correlationId: string,
  ): Promise<TailoredCvPdf> {
    let counted = false;
    const count = (): void => {
      if (counted) return;
      counted = true;
      this.#pdfLimiter.consume(session.userId, "Muitos downloads de PDF; tente de novo mais tarde");
    };
    try {
      const source = await this.postings.tailoredCvSource(session.userId, id);
      count();
      const body = await renderTailoredCvPdf({ content: source.content, base: source.base });
      return {
        fileName: cvPdfFileName({
          name: source.base.contact.name,
          company: source.company,
          title: source.title,
        }),
        body,
      };
    } catch (error) {
      if (error instanceof TailoredCvStaleError || error instanceof TailoredCvRenderError) {
        // `TailoredCvStaleError` comes before `count()` ran (no tailored row): count it now, so a full window
        // answers 429 without another audit row.
        count();
        await this.postings.recordStaleTailoredCv(
          session.userId,
          id,
          error.missingItemId,
          userMeta(session, correlationId),
        );
        throw new ProblemError("TAILORED_CV_STALE", { detail: STALE });
      }
      if (error instanceof TailoredCvTooLargeError) {
        throw new ProblemError("TAILORED_CV_TOO_LARGE", {
          detail: `O CV adaptado passa de ${error.limit.toLocaleString("pt-BR")} caracteres; reprocesse a vaga`,
        });
      }
      if (error instanceof TailoredCvNotReadyError) {
        throw new ProblemError("TAILORED_CV_NOT_READY", {
          detail: "O CV adaptado desta vaga ainda não está pronto",
        });
      }
      throw mapPostingError(error);
    }
  }

  async pasteText(
    session: AuthenticatedSession,
    id: string,
    text: string,
    correlationId: string,
  ): Promise<JobPostingAccepted> {
    this.#reprocessLimiter.consume(
      session.userId,
      "Muitos reprocessamentos; tente de novo mais tarde",
    );
    await this.ensureReady();
    try {
      const { posting, jobId } = await this.postings.pasteText(
        session.userId,
        id,
        text,
        userMeta(session, correlationId),
        this.fetchEnqueue(session, correlationId),
      );
      return accepted(posting, jobId);
    } catch (error) {
      throw mapPostingError(this.mapEnqueueError(error, "job.fetch", correlationId));
    }
  }

  async retry(
    session: AuthenticatedSession,
    id: string,
    correlationId: string,
  ): Promise<JobPostingAccepted> {
    this.#reprocessLimiter.consume(
      session.userId,
      "Muitos reprocessamentos; tente de novo mais tarde",
    );
    await this.ensureReady();
    try {
      const { posting, jobId } = await this.postings.retry(
        session.userId,
        id,
        userMeta(session, correlationId),
        {
          fetch: this.fetchEnqueue(session, correlationId),
          tailor: this.tailorEnqueue(session, correlationId),
        },
      );
      return accepted(posting, jobId);
    } catch (error) {
      throw mapPostingError(this.mapEnqueueError(error, "job", correlationId));
    }
  }

  async delete(session: AuthenticatedSession, id: string, correlationId: string): Promise<void> {
    try {
      await this.postings.delete(session.userId, id, userMeta(session, correlationId));
    } catch (error) {
      throw mapPostingError(error);
    }
  }

  /** Checked before the transaction opens: a producer that is down never holds a transaction or a lock. */
  private async ensureReady(): Promise<void> {
    try {
      await this.queue.ensureReady();
    } catch {
      throw new ProblemError("UPSTREAM_UNAVAILABLE", { detail: QUEUE_UNAVAILABLE });
    }
  }

  private fetchEnqueue(session: AuthenticatedSession, correlationId: string): JobFetchEnqueue {
    return async (db, job) => {
      try {
        const payload = {
          ...envelope(session, correlationId),
          jobPostingId: job.jobPostingId,
          attempt: job.attempt,
        };
        return (await this.queue.enqueueFetch(payload, job.groupId, db)).jobId;
      } catch (error) {
        throw new CareerEnqueueError(error);
      }
    };
  }

  private tailorEnqueue(session: AuthenticatedSession, correlationId: string): CvTailorEnqueue {
    return async (db, job) => {
      try {
        const payload = {
          ...envelope(session, correlationId),
          jobPostingId: job.jobPostingId,
          attempt: job.attempt,
        };
        return (await this.queue.enqueueTailor(payload, db)).jobId;
      } catch (error) {
        throw new CareerEnqueueError(error);
      }
    };
  }

  /** An enqueue failure rolled the whole change back; anything else passes through untouched. */
  private mapEnqueueError(error: unknown, queue: string, correlationId: string): unknown {
    if (!(error instanceof CareerEnqueueError)) return error;
    // Class only: pg-boss and driver errors may quote the statement's parameters.
    this.logger.error(
      { queue, errorClass: error.causeClass, correlationId },
      "career enqueue failed; change rolled back",
    );
    return new ProblemError("UPSTREAM_UNAVAILABLE", { detail: QUEUE_UNAVAILABLE });
  }
}

/** An enqueue failed inside the posting's transaction (rolled back with it). */
class CareerEnqueueError extends Error {
  readonly causeClass: string;

  constructor(override readonly cause: unknown) {
    super("career enqueue failed");
    this.name = "CareerEnqueueError";
    this.causeClass = cause instanceof Error ? cause.name : "unknown";
  }
}

function mapPostingError(error: unknown): unknown {
  if (error instanceof JobPostingNotFoundError) {
    return new ProblemError("NOT_FOUND", { detail: "Vaga não encontrada" });
  }
  if (error instanceof JobPostingTextRequiredError) {
    return new ProblemError("JOB_POSTING_URL_REJECTED", {
      detail:
        "Este link do LinkedIn não é de uma vaga e não pode ser buscado; cole o texto da vaga",
    });
  }
  if (error instanceof JobPostingBusyError) {
    return new ProblemError("JOB_POSTING_INVALID_TRANSITION", { detail: BUSY });
  }
  return error;
}

function envelope(session: AuthenticatedSession, correlationId: string) {
  return {
    schemaVersion: 1 as const,
    correlationId,
    requestedBy: { type: "USER" as const, id: session.userId },
  };
}

function userMeta(session: AuthenticatedSession, correlationId: string): CareerAuditMeta {
  return { correlationId, actor: { type: "USER", userId: session.userId } };
}

function accepted(posting: JobPostingSummaryRecord, jobId: string): JobPostingAccepted {
  return { id: posting.id, status: posting.status, jobId, posting: toSummary(posting) };
}

export function toSummary(record: JobPostingSummaryRecord): JobPostingSummary {
  return {
    id: record.id,
    batchId: record.batchId,
    url: record.url,
    source: record.source,
    status: record.status,
    failureReason: record.failureReason,
    title: record.title,
    company: record.company,
    baseScore: record.baseScore,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toDetail(record: JobPostingRecord): JobPostingDetail {
  return {
    ...toSummary(record),
    extracted: record.extracted,
    droppedRequirementCount: record.droppedRequirementCount,
    injectionSuspected: record.injectionSuspected,
    injectionEvidence: record.injectionEvidence,
    fetchedAt: record.fetchedAt?.toISOString() ?? null,
    blockedDetail:
      record.blocked === null
        ? null
        : { kind: record.blocked.kind, retryAt: record.blocked.retryAt?.toISOString() ?? null },
    tailoring:
      record.tailoring === null
        ? null
        : {
            cvBaseId: record.tailoring.cvBaseId,
            generatedWithPreviousCv: record.tailoring.generatedWithPreviousCv,
            content: record.tailoring.content,
            report: record.tailoring.report,
            generatedAt: record.tailoring.generatedAt.toISOString(),
          },
  };
}
