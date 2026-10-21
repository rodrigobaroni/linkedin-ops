import { Controller, Headers, Inject, Req } from "@nestjs/common";
import type {
  Page,
  Publication,
  PublicationListQuery,
  PublishNowInput,
} from "@linkedin-ops/contracts";
import type { FastifyRequest } from "fastify";
import { ContractRoute } from "../common/contract-route.decorator.js";
import { ContractBody, ContractParams, ContractQuery } from "../common/zod-validation.pipe.js";
import { PublicationsService } from "./publications.service.js";
import { sessionOf } from "./request-session.js";

/** Publication endpoints of MVP-0 (contracts §2.9): publish free text now, history, one publication. */
@Controller()
export class PublicationsController {
  constructor(@Inject(PublicationsService) private readonly publications: PublicationsService) {}

  @ContractRoute("publications.publishNow")
  async publishNow(
    @ContractBody() body: PublishNowInput,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: FastifyRequest,
  ): Promise<Publication> {
    return this.publications.publishNow(sessionOf(request), body.text, idempotencyKey, request.id);
  }

  @ContractRoute("publications.list")
  async list(
    @ContractQuery() query: PublicationListQuery,
    @Req() request: FastifyRequest,
  ): Promise<Page<Publication>> {
    return this.publications.list(sessionOf(request).userId, query, request.id);
  }

  @ContractRoute("publications.get")
  async get(
    @ContractParams() params: { id: string },
    @Req() request: FastifyRequest,
  ): Promise<Publication> {
    return this.publications.get(sessionOf(request).userId, params.id, request.id);
  }
}
