import { Controller, Inject, Req, Res } from "@nestjs/common";
import {
  API_V1_BASE_PATH,
  CV_UPLOAD_LIMITS,
  type CvBase,
  type CvBaseState,
  type CvConfirmInput,
  type CvUploadAccepted,
} from "@linkedin-ops/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ContractRoute } from "../common/contract-route.decorator.js";
import { ProblemError } from "../common/problem.error.js";
import { ContractBody } from "../common/zod-validation.pipe.js";
import { sessionOf } from "../linkedin/request-session.js";
import { CvBaseService } from "./cv-base.service.js";

/** Multipart limit errors of @fastify/multipart (all 413). */
const MULTIPART_LIMIT_CODES: ReadonlySet<string> = new Set([
  "FST_REQ_FILE_TOO_LARGE",
  "FST_FILES_LIMIT",
  "FST_FIELDS_LIMIT",
  "FST_PARTS_LIMIT",
]);

/** "Meu CV" endpoints (spec 2026-10-22 §7): CV base state, PDF upload, confirmation, deletion. */
@Controller()
export class CvBaseController {
  constructor(@Inject(CvBaseService) private readonly cvBases: CvBaseService) {}

  @ContractRoute("career.cv.get")
  async get(@Req() request: FastifyRequest): Promise<CvBaseState> {
    return this.cvBases.state(sessionOf(request).userId);
  }

  @ContractRoute("career.cv.upload")
  async upload(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<CvUploadAccepted> {
    const session = sessionOf(request);
    const file = await readSingleFile(request);
    const accepted = await this.cvBases.upload(session, file, request.id);
    reply.header("location", `${API_V1_BASE_PATH}/career/cv`);
    return accepted;
  }

  @ContractRoute("career.cv.confirm")
  async confirm(
    @ContractBody() body: CvConfirmInput,
    @Req() request: FastifyRequest,
  ): Promise<CvBase> {
    return this.cvBases.confirm(sessionOf(request), body, request.id);
  }

  @ContractRoute("career.cv.delete")
  async delete(@Req() request: FastifyRequest): Promise<void> {
    await this.cvBases.deleteAll(sessionOf(request), request.id);
  }
}

/**
 * Reads the one `file` part into memory (never to disk), bounded by `CV_UPLOAD_LIMITS.maxBytes` through the
 * multipart limits registered in `configureApp`.
 */
async function readSingleFile(request: FastifyRequest): Promise<Buffer> {
  try {
    const part = await request.file();
    if (!part || part.fieldname !== CV_UPLOAD_LIMITS.fieldName) {
      throw new ProblemError("VALIDATION_FAILED", {
        detail: "Envie o PDF no campo file",
        errors: [{ path: [CV_UPLOAD_LIMITS.fieldName], message: "Arquivo obrigatório" }],
      });
    }
    return await part.toBuffer();
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (typeof code === "string" && MULTIPART_LIMIT_CODES.has(code)) {
      throw new ProblemError("PAYLOAD_TOO_LARGE", {
        detail: "Envie um único PDF de até 5 MB",
      });
    }
    throw error;
  }
}
