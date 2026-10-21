import { createHash } from "node:crypto";
import type { PrismaClient } from "../client.js";

/** ADR-0007 §1 / T-015: 5 failures within 1 minute lock the key for 15 minutes. */
export const THROTTLE_MAX_FAILURES = 5;
export const THROTTLE_WINDOW_MS = 60 * 1000;
export const THROTTLE_LOCK_MS = 15 * 60 * 1000;

/** Throttle keys never contain the raw e-mail or IP (data-and-lgpd.md): only a SHA-256 of them. */
export function emailThrottleKey(normalizedEmail: string): string {
  return `email:${sha256(normalizedEmail)}`;
}

export function ipThrottleKey(ip: string | undefined): string {
  return `ip:${sha256(ip ?? "unknown")}`;
}

export function reauthThrottleKey(userId: string): string {
  return `reauth:${userId}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Authentication-attempt counters persisted in `login_throttles`, so a lockout survives restarts. Each key
 * counts attempts in a fixed 1-minute window opened by the first one; the 5th attempt locks the key for
 * 15 minutes, and a successful authentication clears its keys (`reset`). Attempts are counted *before* the
 * password is verified and under a row lock (`SELECT … FOR UPDATE`), so even concurrent requests get at
 * most 5 password checks per window.
 */
export class LoginThrottle {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly now: () => Date,
  ) {}

  /**
   * Counts one attempt for every key. Returns whole seconds until the longest lock ends when any key was
   * already locked (the caller must refuse without verifying), or `null` when the attempt may proceed.
   */
  async consume(keys: readonly string[]): Promise<number | null> {
    const now = this.now();
    let refusedUntil = 0;
    for (const key of keys) {
      const lockedUntil = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          INSERT INTO "login_throttles" ("key", "failures", "window_started_at", "updated_at")
          VALUES (${key}, 0, ${now}, ${now})
          ON CONFLICT ("key") DO NOTHING`;
        const [row] = await tx.$queryRaw<
          { failures: number; window_started_at: Date; locked_until: Date | null }[]
        >`SELECT "failures", "window_started_at", "locked_until"
          FROM "login_throttles" WHERE "key" = ${key} FOR UPDATE`;
        if (!row) throw new Error("login_throttles row vanished inside its own transaction");

        if (row.locked_until && row.locked_until.getTime() > now.getTime()) return row.locked_until;
        const windowExpired =
          row.locked_until !== null ||
          now.getTime() - row.window_started_at.getTime() >= THROTTLE_WINDOW_MS;
        const failures = windowExpired ? 1 : row.failures + 1;
        await tx.loginThrottle.update({
          where: { key },
          data: {
            failures,
            windowStartedAt: windowExpired ? now : row.window_started_at,
            lockedUntil:
              failures >= THROTTLE_MAX_FAILURES ? new Date(now.getTime() + THROTTLE_LOCK_MS) : null,
            updatedAt: now,
          },
        });
        return null;
      });
      if (lockedUntil) refusedUntil = Math.max(refusedUntil, lockedUntil.getTime());
    }
    if (refusedUntil === 0) return null;
    return Math.max(1, Math.ceil((refusedUntil - now.getTime()) / 1000));
  }

  /** A successful authentication clears the counters of these keys. */
  async reset(keys: readonly string[]): Promise<void> {
    await this.prisma.loginThrottle.deleteMany({ where: { key: { in: [...keys] } } });
  }
}
