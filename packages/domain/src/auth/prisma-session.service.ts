import { createHash, createHmac, randomBytes } from "node:crypto";
import type { PrismaClient } from "../client.js";
import { newId } from "../ids.js";
import { minimizeIp, truncateUserAgent } from "./client-meta.js";
import {
  emailThrottleKey,
  ipThrottleKey,
  LoginThrottle,
  reauthThrottleKey,
} from "./login-throttle.js";
import { hashPassword, verifyPassword } from "./password.js";
import {
  ELEVATION_WINDOW_MS,
  SESSION_ABSOLUTE_TTL_MS,
  SESSION_IDLE_TTL_MS,
  SESSION_TOUCH_INTERVAL_MS,
  type AuthenticatedSession,
  type AuthOutcome,
  type IssuedSession,
  type RequestMeta,
  type SessionService,
} from "./session.js";

/** 32 random bytes, base64url: the only copy of the cookie secret lives in the browser. */
const COOKIE_SECRET_BYTES = 32;
/** A base64url cookie of 32 bytes is 43 chars; anything much longer is not ours and is not hashed. */
const COOKIE_MAX_LENGTH = 128;

export interface PrismaSessionServiceOptions {
  prisma: PrismaClient;
  /** HMAC key for the session-bound CSRF token (ADR-0007 N2). */
  sessionSecret: string;
  /** Test hook. */
  now?: () => Date;
}

type Transaction = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/** `email` normalized for lookups and throttle keys (the column itself is `citext`). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** SHA-256 (hex) of the cookie value: what `sessions.secret_hash` stores. */
export function hashSessionSecret(cookieValue: string): string {
  return createHash("sha256").update(cookieValue, "utf8").digest("hex");
}

/** ADR-0007 N2: CSRF token = HMAC-SHA256(SESSION_SECRET, session id); a new id means a new token. */
export function deriveCsrfToken(sessionSecret: string, sessionId: string): string {
  return createHmac("sha256", sessionSecret).update(`csrf:v1:${sessionId}`).digest("base64url");
}

/**
 * PostgreSQL-backed sessions (T-015, ADR-0007 §1–3).
 *
 * - The cookie is 32 random bytes; only its SHA-256 is stored. The public id is a uuid v7.
 * - Absolute lifetime of 30 days counted from the first login (`created_at` is carried across rotations),
 *   idle timeout of 7 days sliding (`expires_at`, refreshed at most once a minute).
 * - Rotation (login, reauth, `rotate`) revokes the old row and inserts the new one in one transaction; the
 *   revoke is conditional (`revoked_at IS NULL`), so of two concurrent rotations exactly one wins and the
 *   old cookie stops resolving at commit.
 * - Login and reauth are throttled per e-mail, per IP and per user (`LoginThrottle`): every attempt is
 *   counted before Argon2id runs and a success clears the counters; the 5th attempt in a minute still gets
 *   its answer, the next one `429`. An unknown e-mail still pays one Argon2id verification so timing does
 *   not reveal which e-mails exist.
 */
export class PrismaSessionService implements SessionService {
  private readonly prisma: PrismaClient;
  private readonly sessionSecret: string;
  private readonly now: () => Date;
  private readonly throttle: LoginThrottle;
  private dummyHash: Promise<string> | undefined;

  constructor({ prisma, sessionSecret, now }: PrismaSessionServiceOptions) {
    this.prisma = prisma;
    this.sessionSecret = sessionSecret;
    this.now = now ?? (() => new Date());
    this.throttle = new LoginThrottle(prisma, this.now);
  }

  async resolve(cookieValue: string | undefined): Promise<AuthenticatedSession | null> {
    if (!cookieValue || cookieValue.length > COOKIE_MAX_LENGTH) return null;
    const row = await this.prisma.session.findUnique({
      where: { secretHash: hashSessionSecret(cookieValue) },
      include: { user: { select: { role: true } } },
    });
    const now = this.now();
    if (!row || row.revokedAt !== null || row.expiresAt.getTime() <= now.getTime()) return null;
    const absoluteEnd = row.createdAt.getTime() + SESSION_ABSOLUTE_TTL_MS;
    if (absoluteEnd <= now.getTime()) return null;

    let expiresAt = row.expiresAt;
    if (now.getTime() - row.lastSeenAt.getTime() >= SESSION_TOUCH_INTERVAL_MS) {
      expiresAt = new Date(Math.min(now.getTime() + SESSION_IDLE_TTL_MS, absoluteEnd));
      await this.prisma.session.updateMany({
        where: { id: row.id, revokedAt: null },
        data: { lastSeenAt: now, expiresAt },
      });
    }
    return this.toAuthenticated({ ...row, expiresAt, role: row.user.role });
  }

  async login(email: string, password: string, meta: RequestMeta): Promise<AuthOutcome> {
    const normalized = normalizeEmail(email);
    const keys = [emailThrottleKey(normalized), ipThrottleKey(meta.ip)];
    const locked = await this.throttle.consume(keys);
    if (locked !== null) return { kind: "rate_limited", retryAfterSeconds: locked };

    const user = await this.prisma.user.findUnique({
      where: { email: normalized },
      select: { id: true, passwordHash: true },
    });
    const valid = user
      ? await verifyPassword(user.passwordHash, password)
      : await verifyPassword(await this.getDummyHash(), password).then(() => false);
    if (!user || !valid) return { kind: "invalid" };

    await this.throttle.reset(keys);
    const issued = await this.prisma.$transaction(async (tx) => {
      const created = await this.insertSession(tx, {
        userId: user.id,
        createdAt: this.now(),
        elevatedUntil: null,
        meta,
      });
      await this.audit(tx, created.session, "auth.login", meta);
      return created;
    });
    return { kind: "ok", issued };
  }

  async reauth(
    session: AuthenticatedSession,
    password: string,
    meta: RequestMeta,
  ): Promise<AuthOutcome> {
    const keys = [reauthThrottleKey(session.userId), ipThrottleKey(meta.ip)];
    const locked = await this.throttle.consume(keys);
    if (locked !== null) return { kind: "rate_limited", retryAfterSeconds: locked };

    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
      select: { passwordHash: true },
    });
    if (!user || !(await verifyPassword(user.passwordHash, password))) {
      return { kind: "invalid" };
    }

    await this.throttle.reset(keys);
    const elevatedUntil = new Date(this.now().getTime() + ELEVATION_WINDOW_MS);
    const issued = await this.rotateTo(session, elevatedUntil, "auth.reauth", meta);
    return issued ? { kind: "ok", issued } : { kind: "session_gone" };
  }

  async rotate(session: AuthenticatedSession, meta: RequestMeta): Promise<IssuedSession | null> {
    return this.rotateTo(session, session.elevatedUntil, "auth.session.rotate", meta);
  }

  async logout(session: AuthenticatedSession, meta: RequestMeta): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const revoked = await tx.session.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: this.now() },
      });
      if (revoked.count > 0) await this.audit(tx, session, "auth.logout", meta);
    });
  }

  async logoutAll(session: AuthenticatedSession, meta: RequestMeta): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.session.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: this.now() },
      });
      await this.audit(tx, session, "auth.logout_all", meta);
    });
  }

  /**
   * Revokes `session` and inserts its successor in one transaction. Returns `null` when the session was
   * already rotated or revoked, or has expired (the conditional UPDATE matched no row).
   */
  private async rotateTo(
    session: AuthenticatedSession,
    elevatedUntil: Date | null,
    action: string,
    meta: RequestMeta,
  ): Promise<IssuedSession | null> {
    const now = this.now();
    return this.prisma.$transaction(async (tx) => {
      const revoked = await tx.session.updateMany({
        where: { id: session.id, revokedAt: null, expiresAt: { gt: now } },
        data: { revokedAt: now },
      });
      if (revoked.count !== 1) return null;
      const previous = await tx.session.findUniqueOrThrow({
        where: { id: session.id },
        select: { userId: true, createdAt: true },
      });
      if (previous.createdAt.getTime() + SESSION_ABSOLUTE_TTL_MS <= now.getTime()) return null;
      const issued = await this.insertSession(tx, {
        userId: previous.userId,
        createdAt: previous.createdAt,
        elevatedUntil,
        meta,
      });
      await this.audit(tx, issued.session, action, meta, { previousSessionId: session.id });
      return issued;
    });
  }

  private async insertSession(
    tx: Transaction,
    input: { userId: string; createdAt: Date; elevatedUntil: Date | null; meta: RequestMeta },
  ): Promise<IssuedSession> {
    const now = this.now();
    const cookieValue = randomBytes(COOKIE_SECRET_BYTES).toString("base64url");
    const absoluteEnd = input.createdAt.getTime() + SESSION_ABSOLUTE_TTL_MS;
    const row = await tx.session.create({
      data: {
        id: newId(),
        userId: input.userId,
        secretHash: hashSessionSecret(cookieValue),
        createdAt: input.createdAt,
        lastSeenAt: now,
        expiresAt: new Date(Math.min(now.getTime() + SESSION_IDLE_TTL_MS, absoluteEnd)),
        elevatedUntil: input.elevatedUntil,
        ip: minimizeIp(input.meta.ip),
        userAgent: truncateUserAgent(input.meta.userAgent),
      },
      include: { user: { select: { role: true } } },
    });
    return {
      session: this.toAuthenticated({ ...row, role: row.user.role }),
      cookieValue,
      // The browser keeps the cookie until the absolute end; the idle timeout is enforced server-side.
      cookieMaxAgeSeconds: Math.max(0, Math.floor((absoluteEnd - now.getTime()) / 1000)),
    };
  }

  private async audit(
    tx: Transaction,
    session: AuthenticatedSession,
    action: string,
    meta: RequestMeta,
    after: Record<string, string> | null = null,
  ): Promise<void> {
    await tx.auditEvent.create({
      data: {
        id: newId(),
        userId: session.userId,
        actorType: "USER",
        actorId: session.userId,
        action,
        entityType: "session",
        entityId: session.id,
        ...(after === null ? {} : { after }),
        correlationId: meta.correlationId,
        ip: minimizeIp(meta.ip),
        userAgent: truncateUserAgent(meta.userAgent),
      },
    });
  }

  private toAuthenticated(row: {
    id: string;
    userId: string;
    role: AuthenticatedSession["role"];
    elevatedUntil: Date | null;
    expiresAt: Date;
  }): AuthenticatedSession {
    return {
      id: row.id,
      userId: row.userId,
      role: row.role,
      csrfToken: deriveCsrfToken(this.sessionSecret, row.id),
      elevatedUntil: row.elevatedUntil,
      expiresAt: row.expiresAt,
    };
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= hashPassword(randomBytes(24).toString("base64url"));
    return this.dummyHash;
  }
}
