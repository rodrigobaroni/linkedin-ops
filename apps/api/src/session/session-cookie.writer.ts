import { Injectable } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { CSRF_TOKEN_HEADER, SESSION_COOKIE_NAME, type IssuedSession } from "./session.service.js";

/**
 * Writes the result of a session rotation to the response: the `__Host-session` cookie (HttpOnly, Secure,
 * SameSite=Lax, Path=/) and the new CSRF token in `X-CSRF-Token` (ADR-0007 N2). Every handler that rotates
 * a session (login, reauth, password change, LinkedIn connect, autonomy change) goes through here, so the
 * cookie and the token always change together.
 */
@Injectable()
export class SessionCookieWriter {
  commit(reply: FastifyReply, issued: IssuedSession): void {
    reply.setCookie(SESSION_COOKIE_NAME, issued.cookieValue, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: issued.cookieMaxAgeSeconds,
    });
    reply.header(CSRF_TOKEN_HEADER, issued.session.csrfToken);
  }

  clear(reply: FastifyReply): void {
    reply.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });
  }
}
