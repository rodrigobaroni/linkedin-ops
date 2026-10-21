import { randomBytes } from "node:crypto";
import {
  ELEVATION_WINDOW_MS,
  type AuthenticatedSession,
  type AuthOutcome,
  type IssuedSession,
  type RequestMeta,
  type SessionService,
  type UserProfile,
  type UserProfiles,
} from "@linkedin-ops/domain";

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export type TestUser = Omit<UserProfile, "linkedinConnected">;

/**
 * Supertest double for the domain `SessionService` port (no database in the e2e suites): `login` and
 * `reauth` fail unless a test replaces them, and sessions are seeded with `issueForTest`. The real
 * PostgreSQL implementation is exercised by `auth.integration.test.ts`. Also answers `UserProfiles`.
 */
export class FakeSessionService implements SessionService, UserProfiles {
  private readonly sessions = new Map<string, AuthenticatedSession>();
  private readonly users = new Map<string, TestUser>();
  readonly calls: { method: string; meta?: RequestMeta }[] = [];

  async resolve(cookieValue: string | undefined): Promise<AuthenticatedSession | null> {
    if (!cookieValue) return null;
    const session = this.sessions.get(cookieValue);
    if (!session) return null;
    if (session.expiresAt.getTime() <= Date.now()) {
      this.sessions.delete(cookieValue);
      return null;
    }
    return session;
  }

  async login(_email: string, _password: string, meta: RequestMeta): Promise<AuthOutcome> {
    this.calls.push({ method: "login", meta });
    return { kind: "invalid" };
  }

  async reauth(
    _session: AuthenticatedSession,
    _password: string,
    meta: RequestMeta,
  ): Promise<AuthOutcome> {
    this.calls.push({ method: "reauth", meta });
    return { kind: "invalid" };
  }

  async rotate(session: AuthenticatedSession): Promise<IssuedSession | null> {
    const user = this.users.get(session.userId);
    if (!user) return null;
    this.revoke(session.id);
    return this.issueForTest(user, { elevated: session.elevatedUntil !== null });
  }

  async logout(session: AuthenticatedSession, meta: RequestMeta): Promise<void> {
    this.calls.push({ method: "logout", meta });
    this.revoke(session.id);
  }

  async logoutAll(session: AuthenticatedSession, meta: RequestMeta): Promise<void> {
    this.calls.push({ method: "logoutAll", meta });
    for (const [cookie, candidate] of this.sessions) {
      if (candidate.userId === session.userId) this.sessions.delete(cookie);
    }
  }

  async get(userId: string): Promise<UserProfile | null> {
    const user = this.users.get(userId);
    return user ? { ...user, linkedinConnected: false } : null;
  }

  /** Test-only seeding. Returns the cookie value to send as `__Host-session`. */
  issueForTest(user: TestUser, options: { elevated?: boolean } = {}): IssuedSession {
    this.users.set(user.id, user);
    const cookieValue = randomBytes(32).toString("base64url");
    const session: AuthenticatedSession = {
      id: randomBytes(16).toString("hex"),
      userId: user.id,
      role: user.role,
      csrfToken: randomBytes(32).toString("base64url"),
      elevatedUntil: options.elevated ? new Date(Date.now() + ELEVATION_WINDOW_MS) : null,
      expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
    };
    this.sessions.set(cookieValue, session);
    return { session, cookieValue, cookieMaxAgeSeconds: SESSION_TTL_SECONDS };
  }

  private revoke(sessionId: string): void {
    for (const [cookie, candidate] of this.sessions) {
      if (candidate.id === sessionId) this.sessions.delete(cookie);
    }
  }
}
