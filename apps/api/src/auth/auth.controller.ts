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
  USER_PROFILES,
  type AuthenticatedSession,
  type AuthOutcome,
  type IssuedSession,
  type RequestMeta,
  type SessionService,
  type UserProfiles,
} from "../session/session.service.js";

const RATE_LIMITED_DETAIL = "Muitas tentativas. Aguarde para tentar de novo";

/**
 * Auth endpoints exactly as `packages/contracts` defines them (ADR-0007 N2): `login`/`reauth` answer
 * `200 { csrfToken, elevatedUntil }` and set the rotated cookie + `X-CSRF-Token`; `me` always carries the
 * current `csrfToken`. Responses are `Cache-Control: no-store` (tag `auth`) and bodies are never logged.
 * Every rule (Argon2id, throttling, rotation, elevation) lives behind the domain `SessionService`.
 */
@Controller()
export class AuthController {
  constructor(
    @Inject(SESSION_SERVICE) private readonly sessions: SessionService,
    @Inject(USER_PROFILES) private readonly profiles: UserProfiles,
    @Inject(SessionCookieWriter) private readonly cookies: SessionCookieWriter,
  ) {}

  @ContractRoute("auth.login")
  async login(
    @ContractBody() body: LoginInput,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<LoginResponse> {
    const issued = issuedOrThrow(
      await this.sessions.login(body.email, body.password, metaOf(request)),
      "E-mail ou senha incorretos",
    );
    this.cookies.commit(reply, issued);
    // A fresh login is never elevated (contract: `elevatedUntil: null`).
    return { csrfToken: issued.session.csrfToken, elevatedUntil: null };
  }

  @ContractRoute("auth.reauth")
  async reauth(
    @ContractBody() body: ReauthInput,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ReauthResponse> {
    const issued = issuedOrThrow(
      await this.sessions.reauth(sessionOf(request), body.password, metaOf(request)),
      "Senha incorreta",
    );
    const elevatedUntil = issued.session.elevatedUntil;
    if (!elevatedUntil) throw new Error("reauth returned a session without elevation");
    this.cookies.commit(reply, issued);
    return { csrfToken: issued.session.csrfToken, elevatedUntil: elevatedUntil.toISOString() };
  }

  @ContractRoute("auth.logout")
  async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    await this.sessions.logout(sessionOf(request), metaOf(request));
    this.cookies.clear(reply);
  }

  @ContractRoute("auth.logoutAll")
  async logoutAll(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    await this.sessions.logoutAll(sessionOf(request), metaOf(request));
    this.cookies.clear(reply);
  }

  @ContractRoute("auth.me")
  async me(@Req() request: FastifyRequest): Promise<Me> {
    const session = sessionOf(request);
    const profile = await this.profiles.get(session.userId);
    if (!profile) throw new ProblemError("AUTH_REQUIRED", { detail: "Faça login para continuar" });
    return {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      role: profile.role,
      locale: profile.locale as Me["locale"],
      timezone: profile.timezone,
      linkedinConnected: profile.linkedinConnected,
      csrfToken: session.csrfToken,
      elevatedUntil: session.elevatedUntil ? session.elevatedUntil.toISOString() : null,
    };
  }
}

function issuedOrThrow(outcome: AuthOutcome, invalidDetail: string): IssuedSession {
  switch (outcome.kind) {
    case "ok":
      return outcome.issued;
    case "invalid":
      throw new ProblemError("AUTH_INVALID_CREDENTIALS", { detail: invalidDetail });
    case "rate_limited":
      throw ProblemError.rateLimited(outcome.retryAfterSeconds, RATE_LIMITED_DETAIL);
    case "session_gone":
      throw new ProblemError("AUTH_REQUIRED", { detail: "Faça login para continuar" });
  }
}

function sessionOf(request: FastifyRequest): AuthenticatedSession {
  if (!request.session) throw new ProblemError("AUTH_REQUIRED");
  return request.session;
}

/** Request metadata for the session port: client IP (per `TRUSTED_PROXY_CIDRS`), user agent, request id. */
export function metaOf(request: FastifyRequest): RequestMeta {
  const userAgent = request.headers["user-agent"];
  return {
    ip: request.ip,
    userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
    correlationId: request.id,
  };
}
