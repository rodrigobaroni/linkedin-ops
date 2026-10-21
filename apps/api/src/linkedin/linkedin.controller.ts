import { Controller, Inject, Req, Res } from "@nestjs/common";
import type {
  LinkedInCallbackQuery,
  LinkedInConnectResponse,
  LinkedInIntegration,
} from "@linkedin-ops/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ContractRoute } from "../common/contract-route.decorator.js";
import { metaOf } from "../auth/auth.controller.js";
import { ContractQuery } from "../common/zod-validation.pipe.js";
import { SessionCookieWriter } from "../session/session-cookie.writer.js";
import {
  SESSION_COOKIE_NAME,
  SESSION_SERVICE,
  type SessionService,
} from "../session/session.service.js";
import { LinkedInOAuthService } from "./linkedin-oauth.service.js";
import { sessionOf } from "./request-session.js";

/**
 * LinkedIn connection endpoints (contracts §2.3). The callback is the only `GET` with side effects
 * (ADR-0007 N4 exception): it is `auth: "none"` in the registry because it is a cross-site top-level
 * navigation, so it resolves the session itself and relies on the single-use `state` (N1).
 */
@Controller()
export class LinkedInController {
  constructor(
    @Inject(LinkedInOAuthService) private readonly oauth: LinkedInOAuthService,
    @Inject(SESSION_SERVICE) private readonly sessions: SessionService,
    @Inject(SessionCookieWriter) private readonly cookies: SessionCookieWriter,
  ) {}

  @ContractRoute("integrations.linkedin.get")
  async get(@Req() request: FastifyRequest): Promise<LinkedInIntegration> {
    return this.oauth.status(sessionOf(request).userId);
  }

  @ContractRoute("integrations.linkedin.connect")
  async connect(@Req() request: FastifyRequest): Promise<LinkedInConnectResponse> {
    return { authorizeUrl: await this.oauth.connect(sessionOf(request)) };
  }

  @ContractRoute("integrations.linkedin.callback")
  async callback(
    @ContractQuery() query: LinkedInCallbackQuery,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const session = await this.sessions.resolve(request.cookies[SESSION_COOKIE_NAME]);
    const live = session && session.expiresAt.getTime() > Date.now() ? session : null;
    const { location, issued } = await this.oauth.handleCallback(query, live, metaOf(request));
    // A-3: a connected callback rotated the session; new cookie + X-CSRF-Token go out with the redirect.
    if (issued) this.cookies.commit(reply, issued);
    await reply.code(302).header("location", location).header("cache-control", "no-store").send();
  }

  @ContractRoute("integrations.linkedin.disconnect")
  async disconnect(@Req() request: FastifyRequest): Promise<void> {
    await this.oauth.disconnect(sessionOf(request), request.id);
  }
}
