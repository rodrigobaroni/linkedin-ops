import { Inject, Injectable } from "@nestjs/common";
import type {
  CvBase,
  CvBaseState,
  CvConfirmInput,
  CvDraft,
  CvStructured,
  CvUploadAccepted,
} from "@linkedin-ops/contracts";
import {
  CvDraftNotReadyError,
  type CvAuditMeta,
  type CvBaseRecord,
  type CvDraftRecord,
  type PrismaCvBases,
} from "@linkedin-ops/domain";
import type { Logger } from "pino";
import { ProblemError } from "../common/problem.error.js";
import { FixedWindowLimiter } from "../linkedin/fixed-window-limiter.js";
import { API_LOGGER } from "../logging/logger.js";
import type { AuthenticatedSession } from "../session/session.service.js";
import { CV_EXTRACT_QUEUE, type CvExtractQueue } from "./cv-extract.queue.js";
import { CvPdfBusyError, CvPdfError, type CvPdfRejection } from "./cv-pdf.js";
import { CV_PDF_EXTRACTOR, type CvPdfExtractor } from "./cv-pdf.extractor.js";

export const CV_BASES = Symbol("CV_BASES");
export const CAREER_RATE_LIMITS = Symbol("CAREER_RATE_LIMITS");

export interface CareerRateLimits {
  windowMs: number;
  /** CV uploads per user (each one costs a `cv.extract` model call in the worker). */
  uploadPerUser: number;
}

export const DEFAULT_CAREER_RATE_LIMITS: Readonly<CareerRateLimits> = {
  windowMs: 60 * 60 * 1000,
  uploadPerUser: 10,
};

/** PT-BR detail per rejection (shown by the web; never file content). */
const PDF_REJECTIONS: Readonly<
  Record<CvPdfRejection, { code: "UNSUPPORTED_MEDIA_TYPE" | "CV_PDF_UNREADABLE"; detail: string }>
> = {
  NOT_PDF: { code: "UNSUPPORTED_MEDIA_TYPE", detail: "Envie o CV em PDF" },
  UNREADABLE: {
    code: "CV_PDF_UNREADABLE",
    detail: "Não foi possível ler o PDF (arquivo corrompido ou protegido por senha)",
  },
  TOO_MANY_PAGES: { code: "CV_PDF_UNREADABLE", detail: "O PDF tem páginas demais para um CV" },
  NO_TEXT: {
    code: "CV_PDF_UNREADABLE",
    detail:
      "O PDF não tem texto selecionável (parece digitalizado); exporte o CV como PDF de texto",
  },
  TOO_MUCH_TEXT: { code: "CV_PDF_UNREADABLE", detail: "O PDF tem texto demais para um CV" },
  TOO_COMPLEX: {
    code: "CV_PDF_UNREADABLE",
    detail: "O PDF é complexo demais para ler; exporte o CV de novo como PDF simples",
  },
};

/**
 * CV base flow of the career module (spec 2026-10-22 §5, PR 2): the API checks the upload, extracts only
 * the PDF text, wipes the file and stores an `EXTRACTING` draft; the worker structures it (`cv.extract`,
 * the only place with model credentials, ADR-0002). The owner then reviews and confirms. CV content is
 * personal data: it never reaches logs, audit snapshots or Problem Details.
 */
@Injectable()
export class CvBaseService {
  readonly #uploadLimiter: FixedWindowLimiter;

  constructor(
    @Inject(CV_BASES) private readonly cvBases: PrismaCvBases<CvStructured>,
    @Inject(CV_EXTRACT_QUEUE) private readonly queue: CvExtractQueue,
    @Inject(CV_PDF_EXTRACTOR) private readonly pdf: CvPdfExtractor,
    @Inject(CAREER_RATE_LIMITS) limits: CareerRateLimits,
    @Inject(API_LOGGER) private readonly logger: Logger,
  ) {
    this.#uploadLimiter = new FixedWindowLimiter(limits.uploadPerUser, limits.windowMs);
  }

  async state(userId: string): Promise<CvBaseState> {
    const { active, draft } = await this.cvBases.state(userId);
    return { active: active ? toCvBase(active) : null, draft: draft ? toCvDraft(draft) : null };
  }

  /** `file` is wiped before this returns, whatever the outcome. */
  async upload(
    session: AuthenticatedSession,
    file: Buffer,
    correlationId: string,
  ): Promise<CvUploadAccepted> {
    let text: string;
    try {
      this.#uploadLimiter.consume(session.userId, "Muitos envios de CV; tente de novo mais tarde");
      text = await this.pdf.extract(file);
    } catch (error) {
      if (error instanceof CvPdfBusyError) {
        throw new ProblemError("SERVICE_NOT_READY", {
          detail: "Muitos CVs sendo lidos agora; tente de novo em instantes",
          headers: { "Retry-After": String(error.retryAfterSeconds) },
        });
      }
      if (!(error instanceof CvPdfError)) throw error;
      const { code, detail } = PDF_REJECTIONS[error.reason];
      throw new ProblemError(code, { detail });
    } finally {
      file.fill(0);
    }

    const meta = userMeta(session, correlationId);
    const draft = await this.cvBases.startDraft(session.userId, text, meta);
    let jobId: string;
    try {
      ({ jobId } = await this.queue.enqueue({
        schemaVersion: 1,
        correlationId,
        requestedBy: { type: "USER", id: session.userId },
        cvBaseId: draft.id,
      }));
    } catch (error) {
      // The draft would wait for a job that does not exist: fail it now (and erase its text).
      this.logger.error(
        { err: error, queue: "cv.extract", cvBaseId: draft.id, correlationId },
        "cv.extract enqueue failed",
      );
      await this.cvBases.failExtraction(draft.id, "EXTRACTION_FAILED", meta);
      throw new ProblemError("UPSTREAM_UNAVAILABLE", {
        detail: "Não foi possível iniciar a leitura do CV; tente de novo",
      });
    }
    return { id: draft.id, status: draft.status, jobId, draft: toCvDraft(draft) };
  }

  async confirm(
    session: AuthenticatedSession,
    input: CvConfirmInput,
    correlationId: string,
  ): Promise<CvBase> {
    try {
      const confirmed = await this.cvBases.confirm(
        session.userId,
        input.draftId,
        input.content,
        userMeta(session, correlationId),
      );
      return toCvBase(confirmed);
    } catch (error) {
      if (!(error instanceof CvDraftNotReadyError)) throw error;
      throw new ProblemError("CV_DRAFT_NOT_READY", {
        detail:
          error.draftStatus === null
            ? "Este rascunho de CV não está mais pendente; recarregue a página"
            : "O rascunho de CV ainda não está pronto para confirmar",
      });
    }
  }

  async deleteAll(session: AuthenticatedSession, correlationId: string): Promise<void> {
    await this.cvBases.deleteAll(session.userId, userMeta(session, correlationId));
  }
}

function userMeta(session: AuthenticatedSession, correlationId: string): CvAuditMeta {
  return { correlationId, actor: { type: "USER", userId: session.userId } };
}

export function toCvDraft(record: CvDraftRecord<CvStructured>): CvDraft {
  return {
    id: record.id,
    version: record.version,
    status: record.status,
    failureReason: record.failureReason,
    content: record.content,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toCvBase(record: CvBaseRecord<CvStructured>): CvBase {
  return {
    id: record.id,
    version: record.version,
    content: record.content,
    confirmedAt: record.confirmedAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
  };
}
