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
 *
 * An attempt is all-or-nothing across its keys (#90): one transaction locks every key, and either counts in
 * all of them (it may verify the password) or, when any key is locked, in none (it is refused). Keys are
 * locked in sorted order, so concurrent attempts with overlapping keys cannot deadlock.
 */
export class LoginThrottle {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly now: () => Date,
  ) {}

  /**
   * Counts one attempt for every key, unless any key is already locked: then nothing is counted and the
   * result is the whole seconds until the longest lock ends (the caller must refuse without verifying).
   * `null` means the attempt was counted and may proceed.
   */
  async consume(keys: readonly string[]): Promise<number | null> {
    const now = this.now();
    const ordered = [...new Set(keys)].sort();
    if (ordered.length === 0) return null;
    const refusedUntil = await this.prisma.$transaction(async (tx) => {
      for (const key of ordered) {
        await tx.$executeRaw`
          INSERT INTO "login_throttles" ("key", "failures", "window_started_at", "updated_at")
          VALUES (${key}, 0, ${now}, ${now})
          ON CONFLICT ("key") DO NOTHING`;
      }
      const rows = await tx.$queryRaw<
        { key: string; failures: number; window_started_at: Date; locked_until: Date | null }[]
      >`SELECT "key", "failures", "window_started_at", "locked_until"
        FROM "login_throttles" WHERE "key" = ANY(${ordered}::text[])
        ORDER BY "key" FOR UPDATE`;
      if (rows.length !== ordered.length) {
        throw new Error("login_throttles row vanished inside its own transaction");
      }

      const lockedUntil = Math.max(
        0,
        ...rows.map((row) => row.locked_until?.getTime() ?? 0).filter((t) => t > now.getTime()),
      );
      if (lockedUntil > 0) return lockedUntil;

      for (const row of rows) {
        // `failures = 0`: the row was just inserted, here or by a refused attempt, and nothing was counted
        // in it yet, so this attempt opens the window.
        const windowExpired =
          row.failures === 0 ||
          row.locked_until !== null ||
          now.getTime() - row.window_started_at.getTime() >= THROTTLE_WINDOW_MS;
        const failures = windowExpired ? 1 : row.failures + 1;
        await tx.loginThrottle.update({
          where: { key: row.key },
          data: {
            failures,
            windowStartedAt: windowExpired ? now : row.window_started_at,
            lockedUntil:
              failures >= THROTTLE_MAX_FAILURES ? new Date(now.getTime() + THROTTLE_LOCK_MS) : null,
            updatedAt: now,
          },
        });
      }
      return 0;
    });
    if (refusedUntil === 0) return null;
    return Math.max(1, Math.ceil((refusedUntil - now.getTime()) / 1000));
  }

  /** A successful authentication clears the counters of these keys. */
  async reset(keys: readonly string[]): Promise<void> {
    await this.prisma.loginThrottle.deleteMany({ where: { key: { in: [...keys] } } });
  }
}
