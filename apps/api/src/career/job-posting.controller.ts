import { Controller, Inject, Req, Res, StreamableFile } from "@nestjs/common";
import {
  API_V1_BASE_PATH,
  type JobPostingAccepted,
  type JobPostingDetail,
  type JobPostingListQuery,
  type JobPostingSummary,
  type JobPostingTextInput,
  type Page,
  type TailoringBatchAccepted,
  type TailoringBatchInput,
} from "@linkedin-ops/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ContractRoute } from "../common/contract-route.decorator.js";
import { ContractBody, ContractParams, ContractQuery } from "../common/zod-validation.pipe.js";
import { sessionOf } from "../linkedin/request-session.js";
import { JobPostingService } from "./job-posting.service.js";

/** `cvPdfFileName` output; anything else never reaches a header (no quote, CR/LF, `;` or path). */
const SAFE_FILE_NAME = /^[A-Za-z0-9-]{1,200}\.pdf$/;

/** "Vagas" endpoints (spec 2026-10-22 §7, PR 3b): batches, list, detail, pasted text, retry, deletion. */
@Controller()
export class JobPostingController {
  constructor(@Inject(JobPostingService) private readonly postings: JobPostingService) {}

  @ContractRoute("career.batches.create")
  async createBatch(
    @ContractBody() body: TailoringBatchInput,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<TailoringBatchAccepted> {
    const accepted = await this.postings.createBatch(sessionOf(request), body, request.id);
    reply.header("location", `${API_V1_BASE_PATH}/career/jobs`);
    return accepted;
  }

  @ContractRoute("career.jobs.list")
  async list(
    @ContractQuery() query: JobPostingListQuery,
    @Req() request: FastifyRequest,
  ): Promise<Page<JobPostingSummary>> {
    return this.postings.list(sessionOf(request).userId, query);
  }

  @ContractRoute("career.jobs.get")
  async get(
    @ContractParams() params: { id: string },
    @Req() request: FastifyRequest,
  ): Promise<JobPostingDetail> {
    return this.postings.get(sessionOf(request).userId, params.id);
  }

  @ContractRoute("career.jobs.pasteText")
  async pasteText(
    @ContractParams() params: { id: string },
    @ContractBody() body: JobPostingTextInput,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<JobPostingAccepted> {
    const accepted = await this.postings.pasteText(
      sessionOf(request),
      params.id,
      body.text,
      request.id,
    );
    reply.header("location", `${API_V1_BASE_PATH}/career/jobs/${params.id}`);
    return accepted;
  }

  @ContractRoute("career.jobs.retry")
  async retry(
    @ContractParams() params: { id: string },
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<JobPostingAccepted> {
    const accepted = await this.postings.retry(sessionOf(request), params.id, request.id);
    reply.header("location", `${API_V1_BASE_PATH}/career/jobs/${params.id}`);
    return accepted;
  }

  /** Binary download: `Cache-Control: no-store` comes with the `career` tag (`ContractRoute`). */
  @ContractRoute("career.jobs.pdf")
  async pdf(
    @ContractParams() params: { id: string },
    @Req() request: FastifyRequest,
  ): Promise<StreamableFile> {
    const file = await this.postings.pdf(sessionOf(request), params.id, request.id);
    if (!SAFE_FILE_NAME.test(file.fileName)) throw new Error("Unsafe PDF file name");
    return new StreamableFile(file.body, {
      type: "application/pdf",
      disposition: `attachment; filename="${file.fileName}"`,
      length: file.body.length,
    });
  }

  @ContractRoute("career.jobs.delete")
  async delete(
    @ContractParams() params: { id: string },
    @Req() request: FastifyRequest,
  ): Promise<void> {
    await this.postings.delete(sessionOf(request), params.id, request.id);
  }
}
