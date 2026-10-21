import { Catch, HttpException, Inject } from "@nestjs/common";
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import {
  ERROR_CODE_HTTP_STATUS,
  PROBLEM_CONTENT_TYPE,
  problemTypeFor,
  type ErrorCode,
  type ProblemDetails,
} from "@linkedin-ops/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";
import { CORRELATION_ID_HEADER } from "./correlation.js";
import { ProblemError } from "./problem.error.js";
import { PROBLEM_TITLES } from "./problem-titles.js";
import { API_LOGGER, type ApiLogger } from "../logging/logger.js";

/** Nest/Fastify status codes that have a stable contract code. Anything else is `INTERNAL`. */
const STATUS_TO_CODE: Readonly<Record<number, ErrorCode>> = {
  400: "VALIDATION_FAILED",
  401: "AUTH_REQUIRED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  413: "PAYLOAD_TOO_LARGE",
  415: "UNSUPPORTED_MEDIA_TYPE",
  429: "RATE_LIMITED",
  503: "SERVICE_NOT_READY",
};

interface FastifyLikeError {
  statusCode?: unknown;
  code?: unknown;
}

/**
 * Single error format for the whole API (contracts.md §4): RFC 9457 Problem Details with a stable `code`,
 * a PT-BR `title` and the request `correlationId`. Internal details never leave the process: unexpected
 * errors become `500 INTERNAL` and are logged with their stack under the same correlation id.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  constructor(@Inject(API_LOGGER) private readonly logger: ApiLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    const correlationId = request.id;

    const resolved = resolveProblem(exception);
    const status = ERROR_CODE_HTTP_STATUS[resolved.code];
    const problem: ProblemDetails = {
      type: problemTypeFor(resolved.code),
      title: PROBLEM_TITLES[resolved.code],
      status,
      ...(resolved.detail === undefined ? {} : { detail: resolved.detail }),
      instance: request.url.split("?")[0] ?? request.url,
      code: resolved.code,
      correlationId,
      ...(resolved.errors === undefined ? {} : { errors: resolved.errors }),
    };

    const log = request.log ?? this.logger;
    if (status >= 500) {
      log.error({ err: exception, code: resolved.code, correlationId }, "request failed");
    } else {
      log.warn({ code: resolved.code, correlationId }, "request rejected");
    }

    reply.header("cache-control", "no-store");
    reply.header(CORRELATION_ID_HEADER, correlationId);
    for (const [name, value] of Object.entries(resolved.headers)) reply.header(name, value);
    reply.status(status).type(PROBLEM_CONTENT_TYPE).send(JSON.stringify(problem));
  }
}

interface ResolvedProblem {
  code: ErrorCode;
  detail?: string;
  errors?: ProblemDetails["errors"];
  headers: Readonly<Record<string, string>>;
}

function resolveProblem(exception: unknown): ResolvedProblem {
  if (exception instanceof ProblemError) {
    return {
      code: exception.code,
      ...(exception.detail === undefined ? {} : { detail: exception.detail }),
      ...(exception.errors === undefined ? {} : { errors: exception.errors }),
      headers: exception.headers,
    };
  }
  if (exception instanceof HttpException) {
    return { code: STATUS_TO_CODE[exception.getStatus()] ?? "INTERNAL", headers: {} };
  }
  // Fastify raises its own errors (body too large, unsupported media type, malformed JSON) with a statusCode.
  const fastifyError = exception as FastifyLikeError | null;
  if (
    fastifyError &&
    typeof fastifyError === "object" &&
    typeof fastifyError.statusCode === "number"
  ) {
    const code = STATUS_TO_CODE[fastifyError.statusCode];
    if (code && fastifyError.statusCode < 500) {
      return {
        code,
        ...(code === "VALIDATION_FAILED"
          ? { detail: "Corpo da requisição não é JSON válido" }
          : {}),
        headers: {},
      };
    }
  }
  return { code: "INTERNAL", headers: {} };
}
