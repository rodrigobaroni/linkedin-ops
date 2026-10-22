import { timingSafeEqual } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  REQUESTED_WITH_HEADER,
  type RouteAuth,
  type RouteDefinition,
  type UserRole,
} from "@linkedin-ops/contracts";
import type { RuntimeEnv } from "@linkedin-ops/domain";
import type { FastifyRequest } from "fastify";
import { RUNTIME_ENV } from "../config/runtime-env.module.js";
import {
  CSRF_TOKEN_REQUEST_HEADER,
  SESSION_COOKIE_NAME,
  SESSION_SERVICE,
  type AuthenticatedSession,
  type SessionService,
} from "../session/session.service.js";
import { contractRouteOf, ROUTE_AUTH_KEY } from "./contract-route.decorator.js";
import { ProblemError } from "./problem.error.js";

export const MUTATING_METHODS: ReadonlySet<string> = new Set(["POST", "PUT", "PATCH", "DELETE"]);
export const REQUESTED_WITH_VALUE: string = REQUESTED_WITH_HEADER.value;
const REQUESTED_WITH_NAME = REQUESTED_WITH_HEADER.name.toLowerCase();
const METHOD_OVERRIDE_HEADERS = [
  "x-http-method-override",
  "x-http-method",
  "x-method-override",
] as const;

declare module "fastify" {
  interface FastifyRequest {
    /** Set by `RouteAccessGuard` for every route whose auth level is not `none`. */
    session?: AuthenticatedSession;
  }
}

/**
 * ADR-0007 N4 as a global guard. Every `POST/PUT/PATCH/DELETE` must carry `Origin` exactly equal to
 * `APP_BASE_URL`, `Content-Type: application/json` and `X-Requested-With: linkedin-ops`; `Origin: null`,
 * form bodies, method-override headers and cross-site Fetch Metadata are rejected (`403 CSRF_REJECTED`).
 * The one exception is a route whose registry entry declares `requestContentType: multipart/form-data`
 * (uploads): it accepts only that type (`415 UNSUPPORTED_MEDIA_TYPE` otherwise) and keeps every other control.
 * Then the route's auth level applies: `session` requires a live `__Host-session` (`401 AUTH_REQUIRED`),
 * `elevated` adds `X-CSRF-Token` bound to the session (`403 CSRF_REJECTED`) and a recent re-authentication
 * (`401 AUTH_REAUTH_REQUIRED`); `roles` narrows further (`403 FORBIDDEN`). The level comes from the route
 * registry (`@ContractRoute`), or `@RouteAuth` for the few routes outside it; with neither, `session`.
 * The only mutation without a session is `POST /auth/login`, because the registry says `auth: "none"`.
 */
@Injectable()
export class RouteAccessGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(RUNTIME_ENV) private readonly env: RuntimeEnv,
    @Inject(SESSION_SERVICE) private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const handler = context.getHandler();
    const route = contractRouteOf(handler);
    const auth: RouteAuth =
      route?.auth ?? this.reflector.get<RouteAuth>(ROUTE_AUTH_KEY, handler) ?? "session";
    const roles: readonly UserRole[] | undefined = route?.roles;

    this.rejectMethodOverride(request);
    if (MUTATING_METHODS.has(request.method)) {
      this.enforceCsrfControls(request, route?.requestContentType ?? "application/json");
    }
    if (auth === "none") return true;

    const session = await this.sessions.resolve(request.cookies[SESSION_COOKIE_NAME]);
    if (!session || session.expiresAt.getTime() <= Date.now()) {
      throw new ProblemError("AUTH_REQUIRED", { detail: "Faça login para continuar" });
    }
    request.session = session;

    if (auth === "elevated") {
      const provided = header(request, CSRF_TOKEN_REQUEST_HEADER);
      if (!provided || !constantTimeEquals(provided, session.csrfToken)) {
        throw new ProblemError("CSRF_REJECTED", { detail: "Token CSRF ausente ou inválido" });
      }
      if (!session.elevatedUntil || session.elevatedUntil.getTime() <= Date.now()) {
        throw new ProblemError("AUTH_REAUTH_REQUIRED", {
          detail: "Confirme sua senha para esta ação",
        });
      }
    }

    if (roles && !roles.includes(session.role)) {
      throw new ProblemError("FORBIDDEN", { detail: "Seu perfil não pode executar esta ação" });
    }
    return true;
  }

  private rejectMethodOverride(request: FastifyRequest): void {
    for (const name of METHOD_OVERRIDE_HEADERS) {
      if (header(request, name) !== undefined) {
        throw new ProblemError("CSRF_REJECTED", {
          detail: "Sobrescrita de método não é permitida",
        });
      }
    }
    const query = request.query as Record<string, unknown> | undefined;
    if (query && Object.prototype.hasOwnProperty.call(query, "_method")) {
      throw new ProblemError("CSRF_REJECTED", { detail: "Sobrescrita de método não é permitida" });
    }
  }

  private enforceCsrfControls(
    request: FastifyRequest,
    declaredContentType: NonNullable<RouteDefinition["requestContentType"]>,
  ): void {
    const origin = header(request, "origin");
    if (origin === undefined || origin === "null" || origin !== this.env.appBaseUrl) {
      throw new ProblemError("CSRF_REJECTED", { detail: "Origem da requisição não permitida" });
    }
    const fetchSite = header(request, "sec-fetch-site");
    if (fetchSite !== undefined && fetchSite !== "same-origin") {
      throw new ProblemError("CSRF_REJECTED", { detail: "Origem da requisição não permitida" });
    }
    const contentType = header(request, "content-type");
    if (declaredContentType === "application/json" && !isJson(contentType)) {
      throw new ProblemError("CSRF_REJECTED", { detail: "Content-Type deve ser application/json" });
    }
    if (header(request, REQUESTED_WITH_NAME) !== REQUESTED_WITH_VALUE) {
      throw new ProblemError("CSRF_REJECTED", {
        detail: "Cabeçalho X-Requested-With ausente ou inválido",
      });
    }
    // An upload route (the registry declares `multipart/form-data`) is the only place a form body passes;
    // past the Origin and X-Requested-With checks, any other type is a client error, not CSRF.
    if (
      declaredContentType !== "application/json" &&
      mediaTypeOf(contentType) !== declaredContentType
    ) {
      throw new ProblemError("UNSUPPORTED_MEDIA_TYPE", {
        detail: `Content-Type deve ser ${declaredContentType}`,
      });
    }
  }
}

function header(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  if (Array.isArray(value)) return value.length === 1 ? value[0] : undefined;
  return value;
}

/** Media type without parameters, lowercased (`Multipart/Form-Data; boundary=x` → `multipart/form-data`). */
export function mediaTypeOf(contentType: string | undefined): string | undefined {
  return contentType?.split(";")[0]?.trim().toLowerCase();
}

/** `application/json` with optional parameters (`; charset=utf-8`); anything else fails. */
export function isJson(contentType: string | undefined): boolean {
  return mediaTypeOf(contentType) === "application/json";
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
