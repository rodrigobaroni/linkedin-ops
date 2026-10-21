import type { FastifyRequest } from "fastify";
import { ProblemError } from "../common/problem.error.js";
import type { AuthenticatedSession } from "../session/session.service.js";

/** Session attached by `RouteAccessGuard`; its absence on a session route is a wiring bug, answered 401. */
export function sessionOf(request: FastifyRequest): AuthenticatedSession {
  if (!request.session) throw new ProblemError("AUTH_REQUIRED");
  return request.session;
}
