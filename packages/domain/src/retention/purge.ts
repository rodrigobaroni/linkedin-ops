/**
 * Daily retention purge (T-063, PR 2). It applies ONLY the periods fixed in an ADR, a spec or code
 * (docs/security/data-inventory.md §2, "[definido]"):
 *
 * - `sessions`: a session that expired (idle 7 days), was revoked, or passed its 30-day absolute lifetime (ADR-0007)
 *   no longer authenticates; its row (hash, IP, user agent) goes.
 * - `oauth_states`: valid 10 minutes and single-use (OAuth flow); expired or used rows go.
 * - `idempotency_keys`: kept 24 h (`expires_at`, contracts.md §1); expired rows go.
 *
 * The page text of failed postings and the PDF text of CV drafts are already erased by their own sweeps. Every
 * period that is only proposed in the data-and-lgpd.md matrix (login throttles, audit, logs, backups…) waits for
 * Rodrigo's decision D1 and is never purged here. Cutoffs come from the application clock, never SQL `now()`.
 */
import type { PrismaClient } from "../client.js";
import { SESSION_ABSOLUTE_TTL_MS } from "../auth/session.js";
import { newId } from "../ids.js";

export interface RetentionPurgeResult {
  dryRun: boolean;
  /** Rows deleted, or that would be deleted on a dry run, per category. */
  sessions: number;
  oauthStates: number;
  idempotencyKeys: number;
}

export class PrismaRetentionPurge {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * One pass over every defined category; idempotent (a second pass finds nothing). A dry run only counts. A real
   * pass that deleted something records one `retention.purged` audit event with the counts, never row content.
   */
  async run(options: { dryRun: boolean; correlationId?: string }): Promise<RetentionPurgeResult> {
    const now = this.now();
    const absoluteCutoff = new Date(now.getTime() - SESSION_ABSOLUTE_TTL_MS);
    const sessions = {
      OR: [
        { expiresAt: { lt: now } },
        { revokedAt: { lt: now } },
        { createdAt: { lt: absoluteCutoff } },
      ],
    };
    const oauthStates = { OR: [{ expiresAt: { lt: now } }, { usedAt: { lt: now } }] };
    const idempotencyKeys = { expiresAt: { lt: now } };

    if (options.dryRun) {
      return {
        dryRun: true,
        sessions: await this.prisma.session.count({ where: sessions }),
        oauthStates: await this.prisma.oAuthState.count({ where: oauthStates }),
        idempotencyKeys: await this.prisma.idempotencyKey.count({ where: idempotencyKeys }),
      };
    }
    // One short transaction: never a deletion without its audit event. OAuth states first: they reference sessions.
    return this.prisma.$transaction(async (tx) => {
      const result: RetentionPurgeResult = {
        dryRun: false,
        oauthStates: (await tx.oAuthState.deleteMany({ where: oauthStates })).count,
        sessions: (await tx.session.deleteMany({ where: sessions })).count,
        idempotencyKeys: (await tx.idempotencyKey.deleteMany({ where: idempotencyKeys })).count,
      };
      if (result.sessions + result.oauthStates + result.idempotencyKeys > 0) {
        await tx.auditEvent.create({
          data: {
            id: newId(),
            userId: null,
            actorType: "SYSTEM",
            action: "retention.purged",
            entityType: "retention",
            after: {
              sessions: result.sessions,
              oauthStates: result.oauthStates,
              idempotencyKeys: result.idempotencyKeys,
            },
            correlationId: options.correlationId ?? `retention:${now.toISOString()}`,
          },
        });
      }
      return result;
    });
  }
}
