import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { LoginInput, Me } from "@linkedin-ops/contracts";
import type {
  AuthenticatedSession,
  IssuedSession,
  RequestMeta,
  SessionService,
} from "./session.service.js";

export const ELEVATION_WINDOW_MS = 15 * 60 * 1000;
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface TestUser {
  id: string;
  email: string;
  name: string;
  role: Me["role"];
  locale: Me["locale"];
  timezone: string;
}

/**
 * TODO(T-015): replace with the PostgreSQL-backed `SessionService`.
 *
 * Placeholder that keeps the API bootable before T-015 without creating any way in: `login` and `reauth`
 * always fail (there are no credentials to verify), so every environment answers `401`. Only tests can
 * seed a session, through `issueForTest`, to exercise the guard, `GET /auth/me` and the response headers.
 */
@Injectable()
export class InMemorySessionService implements SessionService {
  private readonly sessions = new Map<string, { session: AuthenticatedSession; user: TestUser }>();

  async resolve(cookieValue: string | undefined): Promise<AuthenticatedSession | null> {
    if (!cookieValue) return null;
    const entry = this.sessions.get(cookieValue);
    if (!entry) return null;
    if (entry.session.expiresAt.getTime() <= Date.now()) {
      this.sessions.delete(cookieValue);
      return null;
    }
    return entry.session;
  }

  async login(_input: LoginInput, _meta: RequestMeta): Promise<IssuedSession | null> {
    return null;
  }

  async reauth(
    _session: AuthenticatedSession,
    _password: string,
    _meta: RequestMeta,
  ): Promise<IssuedSession | null> {
    return null;
  }

  async me(session: AuthenticatedSession): Promise<Me> {
    const entry = [...this.sessions.values()].find(
      (candidate) => candidate.session.id === session.id,
    );
    if (!entry) throw new Error("Session vanished");
    return {
      id: entry.user.id,
      email: entry.user.email,
      name: entry.user.name,
      role: entry.user.role,
      locale: entry.user.locale,
      timezone: entry.user.timezone,
      linkedinConnected: false,
      csrfToken: session.csrfToken,
      elevatedUntil: session.elevatedUntil ? session.elevatedUntil.toISOString() : null,
    };
  }

  /** Test-only seeding. Returns the cookie value to send as `__Host-session`. */
  issueForTest(user: TestUser, options: { elevated?: boolean } = {}): IssuedSession {
    const cookieValue = randomBytes(32).toString("base64url");
    const session: AuthenticatedSession = {
      id: randomBytes(16).toString("hex"),
      userId: user.id,
      role: user.role,
      csrfToken: randomBytes(32).toString("base64url"),
      elevatedUntil: options.elevated ? new Date(Date.now() + ELEVATION_WINDOW_MS) : null,
      expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
    };
    this.sessions.set(cookieValue, { session, user });
    return { session, cookieValue, cookieMaxAgeSeconds: SESSION_TTL_SECONDS };
  }
}
