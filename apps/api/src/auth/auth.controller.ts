import { Controller, Inject, Req, Res } from "@nestjs/common";
import type {
  LoginInput,
  LoginResponse,
  Me,
  ReauthInput,
  ReauthResponse,
} from "@linkedin-ops/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ContractRoute } from "../common/contract-route.decorator.js";
import { ProblemError } from "../common/problem.error.js";
import { ContractBody } from "../common/zod-validation.pipe.js";
import { SessionCookieWriter } from "../session/session-cookie.writer.js";
import {
  SESSION_SERVICE,
  type AuthenticatedSession,
  type RequestMeta,
  type SessionService,
} from "../session/session.service.js";

/**
 * Auth endpoints exactly as `packages/contracts` defines them (ADR-0007 N2): `login`/`reauth` answer
 * `200 { csrfToken, elevatedUntil }` and set the rotated cookie + `X-CSRF-Token`; `me` always carries the
 * current `csrfToken`. Responses are `Cache-Control: no-store` (tag `auth`) and bodies are never logged.
 * Credential verification, storage and rotation live behind `SessionService` (T-015).
 */
@Controller()
export class AuthController {
  constructor(
    @Inject(SESSION_SERVICE) private readonly sessions: SessionService,
    @Inject(SessionCookieWriter) private readonly cookies: SessionCookieWriter,
  ) {}

  @ContractRoute("auth.login")
  async login(
    @ContractBody() body: LoginInput,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<LoginResponse> {
    const issued = await this.sessions.login(body, metaOf(request));
    if (!issued) {
      throw new ProblemError("AUTH_INVALID_CREDENTIALS", { detail: "E-mail ou senha incorretos" });
    }
    this.cookies.commit(reply, issued);
    return { csrfToken: issued.session.csrfToken, elevatedUntil: null };
  }

  @ContractRoute("auth.reauth")
  async reauth(
    @ContractBody() body: ReauthInput,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ReauthResponse> {
    const issued = await this.sessions.reauth(sessionOf(request), body.password, metaOf(request));
    if (!issued || !issued.session.elevatedUntil) {
      throw new ProblemError("AUTH_INVALID_CREDENTIALS", { detail: "Senha incorreta" });
    }
    this.cookies.commit(reply, issued);
    return {
      csrfToken: issued.session.csrfToken,
      elevatedUntil: issued.session.elevatedUntil.toISOString(),
    };
  }

  @ContractRoute("auth.me")
  async me(@Req() request: FastifyRequest): Promise<Me> {
    return this.sessions.me(sessionOf(request));
  }
}

function sessionOf(request: FastifyRequest): AuthenticatedSession {
  if (!request.session) throw new ProblemError("AUTH_REQUIRED");
  return request.session;
}

function metaOf(request: FastifyRequest): RequestMeta {
  const userAgent = request.headers["user-agent"];
  return { ip: request.ip, userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent };
}
