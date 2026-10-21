/**
 * T-005 acceptance evidence, against a real PostgreSQL (Testcontainers, postgres:17-alpine):
 * - `prisma migrate deploy` applies the baseline from scratch and the seed is idempotent;
 * - unique indexes: publications.idempotency_key, (curation_runs.user_id, scheduled_for, trigger),
 *   (sources.user_id, canonical_url);
 * - draft_versions, approvals and audit_events are append-only (UPDATE/DELETE/TRUNCATE rejected);
 * - schedules.scheduled_at + timezone are mandatory;
 * - partial unique indexes I7/I8, CHECK I5;
 * - every enum type migrated into PostgreSQL (pg_type/pg_enum) matches the contracts/schema matrix;
 * - T-039 manual publications: exactly one origin (draft version or body) and a fail-closed rollback.
 *
 * Without Docker, point `INTEGRATION_DATABASE_URL` at an EMPTY database the user may create databases on
 * (e.g. a throwaway local cluster); the container is then skipped.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seed } from "../../prisma/seed.js";
import { createPrismaClient, type PrismaClient } from "../../src/client.js";
import { newId } from "../../src/ids.js";
import { expectedDatabaseEnums } from "../enum-matrix.js";

const PACKAGE_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const PRISMA_BIN = fileURLToPath(new URL("../../node_modules/.bin/prisma", import.meta.url));
// Pinned by tag + digest (Sentinela, TM-21); the same reference is used by ci.yml and by the Compose
// file (T-003). Dependabot (ecosystem `docker`, enabled in T-003) proposes digest updates.
const POSTGRES_IMAGE =
  "postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24";

function migrateDeploy(databaseUrl: string): string {
  return execFileSync(PRISMA_BIN, ["migrate", "deploy"], {
    cwd: PACKAGE_ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function expectRejects(promise: Promise<unknown>, pattern: RegExp): Promise<void> {
  await expect(promise).rejects.toSatisfy((error: unknown) => {
    const message =
      error instanceof Error ? `${error.message} ${JSON.stringify(error)}` : String(error);
    if (!pattern.test(message)) throw new Error(`Expected ${pattern} in error, got: ${message}`);
    return true;
  });
}

const UNIQUE = /Unique constraint|23505|duplicate key/i;
const NOT_NULL = /23502|null value|not-null/i;
const CHECK = /23514|check constraint/i;
const APPEND_ONLY = /append-only/;

let container: StartedPostgreSqlContainer | undefined;
let databaseUrl: string;
let prisma: PrismaClient;
/** Seeded user (dev@example.com); shared read-only by the seed tests. */
let seededUserId: string;

/**
 * Fixture: its own user → pillar → voice profile → curation run (PARTIAL: one opportunity, I1) →
 * opportunity → draft → version 1. A fresh user per call keeps every per-user unique index
 * (voice version, pillar slug, run instant) isolated, so tests run in any order and never share state.
 */
async function createDraftWithVersion() {
  const user = await prisma.user.create({
    data: {
      id: newId(),
      email: `fixture-${newId()}@example.com`,
      passwordHash: "not-a-login",
      name: "F",
    },
  });
  const userId = user.id;
  const pillar = await prisma.contentPillar.create({
    data: { id: newId(), userId, slug: "fixture", name: "Fixture" },
  });
  const voice = await prisma.voiceProfile.create({
    data: { id: newId(), userId, version: 1, tone: "fixture" },
  });
  const run = await prisma.curationRun.create({
    data: { id: newId(), userId, scheduledFor: new Date(), trigger: "MANUAL", status: "PARTIAL" },
  });
  const opportunity = await prisma.opportunity.create({
    data: {
      id: newId(),
      userId,
      curationRunId: run.id,
      origin: "CURATION",
      title: "Fixture",
      summary: "Fixture",
      contentPillarId: pillar.id,
      targetAudience: "Fixture",
      relevanceReason: "Fixture",
      suggestedAngle: "Fixture",
      suggestedFormat: "CODE_CARD",
      score: "80.00",
      scoreBreakdown: {},
      rank: 1,
    },
  });
  const draft = await prisma.draft.create({
    data: {
      id: newId(),
      userId,
      opportunityId: opportunity.id,
      voiceProfileId: voice.id,
      status: "DRAFT",
    },
  });
  const version = await prisma.draftVersion.create({
    data: {
      id: newId(),
      draftId: draft.id,
      userId,
      versionNumber: 1,
      authorType: "SYSTEM",
      body: "Fixture body",
    },
  });
  await prisma.draft.update({ where: { id: draft.id }, data: { currentVersionId: version.id } });
  return { userId, draft, version, opportunity, run, voice };
}

beforeAll(async () => {
  const external = process.env.INTEGRATION_DATABASE_URL;
  if (!external) container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  databaseUrl = external ?? container!.getConnectionUri();
  const output = migrateDeploy(databaseUrl);
  expect(output).toMatch(/20261016120000_init/);
  expect(output).toMatch(/20261021210000_manual_publications/);
  prisma = createPrismaClient({ connectionString: databaseUrl, maxConnections: 4 });
  seededUserId = (await seed(prisma)).userId;
});

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

describe("migration baseline", () => {
  it("applies every migration from scratch, in order, and enables citext", async () => {
    const migrations = await prisma.$queryRaw<{ name: string; finished: boolean }[]>`
      SELECT migration_name AS name, finished_at IS NOT NULL AS finished FROM _prisma_migrations
      ORDER BY migration_name`;
    expect(migrations).toEqual([
      { name: "20261016120000_init", finished: true },
      { name: "20261021210000_manual_publications", finished: true },
    ]);
    const extensions = await prisma.$queryRaw<{ extname: string }[]>`
      SELECT extname FROM pg_extension WHERE extname = 'citext'`;
    expect(extensions).toHaveLength(1);
  });

  it("stores the contract (lowercase) values for briefing §13 enums", async () => {
    const [row] = await prisma.$queryRaw<{ values: string[] }[]>`
      SELECT enum_range(NULL::opportunity_status)::text[] AS values`;
    expect(row?.values).toEqual(["candidate", "selected", "dismissed", "expired"]);
    const [format] = await prisma.$queryRaw<{ values: string[] }[]>`
      SELECT enum_range(NULL::suggested_format)::text[] AS values`;
    expect(format?.values).toEqual(["text", "code-card", "image", "carousel"]);
  });

  it("migrates every enum of the contracts/schema matrix, by type name and ordered labels", async () => {
    // pg_type/pg_enum is the source of truth for what the migration created; the matrix
    // (test/enum-matrix.ts) is what contracts + schema.prisma prescribe. Both sides must be equal:
    // no extra or missing type, no extra, missing or reordered label. `typname`/`enumlabel` are of
    // type `name`, which the pg driver adapter cannot deserialize: cast to text.
    const rows = await prisma.$queryRaw<{ name: string; labels: string[] }[]>`
      SELECT t.typname::text AS name,
             array_agg(e.enumlabel::text ORDER BY e.enumsortorder)::text[] AS labels
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typtype = 'e' AND n.nspname = current_schema()
      GROUP BY t.typname
      ORDER BY t.typname`;
    const migrated = Object.fromEntries(rows.map((r) => [r.name, r.labels]));
    const expected = expectedDatabaseEnums();
    expect(Object.keys(expected).length).toBeGreaterThan(20);
    expect(migrated).toEqual(expected);
  });
});

describe("seed", () => {
  it("is idempotent: a second run changes nothing", async () => {
    const before = await Promise.all([
      prisma.user.count(),
      prisma.contentPillar.count(),
      prisma.source.count(),
      prisma.autonomySettings.count(),
    ]);
    expect(before).toEqual([1, 3, 2, 1]);
    const again = await seed(prisma);
    expect(again.userId).toBe(seededUserId);
    const after = await Promise.all([
      prisma.user.count(),
      prisma.contentPillar.count(),
      prisma.source.count(),
      prisma.autonomySettings.count(),
    ]);
    expect(after).toEqual(before);
  });

  it("logs in case-insensitively (citext e-mail) and never stores a plaintext password", async () => {
    const user = await prisma.user.findUnique({ where: { email: "DEV@EXAMPLE.COM" } });
    expect(user?.id).toBe(seededUserId);
    expect(user?.passwordHash).toMatch(/^\$argon2id\$/);
  });
});

describe("unique indexes (acceptance criteria)", () => {
  it("publications.idempotency_key is unique", async () => {
    const { userId, draft, version } = await createDraftWithVersion();
    const base = {
      userId,
      draftId: draft.id,
      draftVersionId: version.id,
      idempotencyKey: `pub:${draft.id}:${version.id}:manual:${newId()}`,
      status: "FAILED" as const,
    };
    await prisma.publication.create({ data: { id: newId(), ...base } });
    await expectRejects(prisma.publication.create({ data: { id: newId(), ...base } }), UNIQUE);
  });

  it("(curation_runs.user_id, scheduled_for, trigger) is unique; another trigger is allowed", async () => {
    const { userId } = await createDraftWithVersion();
    const scheduledFor = new Date("2026-10-19T12:00:00Z");
    await prisma.curationRun.create({
      data: { id: newId(), userId, scheduledFor, trigger: "CRON" },
    });
    await expectRejects(
      prisma.curationRun.create({ data: { id: newId(), userId, scheduledFor, trigger: "CRON" } }),
      UNIQUE,
    );
    await expect(
      prisma.curationRun.create({ data: { id: newId(), userId, scheduledFor, trigger: "MANUAL" } }),
    ).resolves.toBeTruthy();
  });

  it("sources.canonical_url is unique per user", async () => {
    const userId = seededUserId;
    const existing = await prisma.source.findFirstOrThrow({ where: { userId } });
    await expectRejects(
      prisma.source.create({
        data: {
          id: newId(),
          userId,
          type: "RSS",
          name: "Duplicate",
          url: existing.url,
          canonicalUrl: existing.canonicalUrl,
        },
      }),
      UNIQUE,
    );
    const otherUser = await prisma.user.create({
      data: {
        id: newId(),
        email: `second-${newId()}@example.com`,
        passwordHash: "not-a-login",
        name: "Second",
      },
    });
    await expect(
      prisma.source.create({
        data: {
          id: newId(),
          userId: otherUser.id,
          type: "RSS",
          name: "Same feed, other user",
          url: existing.url,
          canonicalUrl: existing.canonicalUrl,
        },
      }),
    ).resolves.toBeTruthy();
  });
});

describe("append-only tables (I3, I11)", () => {
  it("draft_versions rejects UPDATE, DELETE and TRUNCATE", async () => {
    const { version } = await createDraftWithVersion();
    await expectRejects(
      prisma.draftVersion.update({ where: { id: version.id }, data: { body: "edited" } }),
      APPEND_ONLY,
    );
    await expectRejects(prisma.draftVersion.delete({ where: { id: version.id } }), APPEND_ONLY);
    await expectRejects(prisma.$executeRawUnsafe(`TRUNCATE "draft_versions" CASCADE`), APPEND_ONLY);
    const intact = await prisma.draftVersion.findUnique({ where: { id: version.id } });
    expect(intact?.body).toBe("Fixture body");
  });

  it("approvals rejects UPDATE, DELETE and TRUNCATE", async () => {
    const { userId, draft, version } = await createDraftWithVersion();
    const approval = await prisma.approval.create({
      data: {
        id: newId(),
        userId,
        draftId: draft.id,
        draftVersionId: version.id,
        decision: "APPROVED",
        actorType: "USER",
        actorUserId: userId,
        autonomyMode: "ASSISTED",
      },
    });
    await expectRejects(
      prisma.approval.update({ where: { id: approval.id }, data: { decision: "REJECTED" } }),
      APPEND_ONLY,
    );
    await expectRejects(prisma.approval.delete({ where: { id: approval.id } }), APPEND_ONLY);
    await expectRejects(prisma.$executeRawUnsafe(`TRUNCATE "approvals" CASCADE`), APPEND_ONLY);
    await expectRejects(
      prisma.$executeRawUnsafe(`UPDATE "approvals" SET "reason" = 'x'`),
      APPEND_ONLY,
    );
    const intact = await prisma.approval.findUnique({ where: { id: approval.id } });
    expect(intact?.decision).toBe("APPROVED");
  });

  it("audit_events rejects UPDATE, DELETE and TRUNCATE", async () => {
    const userId = seededUserId;
    const event = await prisma.auditEvent.create({
      data: {
        id: newId(),
        userId,
        actorType: "USER",
        actorId: userId,
        action: "draft.approve",
        entityType: "Draft",
        correlationId: "test",
      },
    });
    await expectRejects(
      prisma.auditEvent.update({ where: { id: event.id }, data: { action: "draft.reject" } }),
      APPEND_ONLY,
    );
    await expectRejects(prisma.auditEvent.delete({ where: { id: event.id } }), APPEND_ONLY);
    await expectRejects(prisma.$executeRawUnsafe(`DELETE FROM "audit_events"`), APPEND_ONLY);
    await expectRejects(prisma.$executeRawUnsafe(`TRUNCATE "audit_events"`), APPEND_ONLY);
    const intact = await prisma.auditEvent.findUnique({ where: { id: event.id } });
    expect(intact?.action).toBe("draft.approve");
  });
});

describe("schedules (I6, I7)", () => {
  it("scheduled_at and timezone are mandatory", async () => {
    const { userId, draft, version } = await createDraftWithVersion();
    await expectRejects(
      prisma.$executeRaw`
        INSERT INTO "schedules" ("id", "user_id", "draft_id", "draft_version_id", "scheduled_at", "timezone",
          "requested_local_time", "created_by_type", "updated_at")
        VALUES (${newId()}::uuid, ${userId}::uuid, ${draft.id}::uuid, ${version.id}::uuid, now(), NULL,
          '2026-10-20T09:00', 'USER', now())`,
      NOT_NULL,
    );
    await expectRejects(
      prisma.$executeRaw`
        INSERT INTO "schedules" ("id", "user_id", "draft_id", "draft_version_id", "scheduled_at", "timezone",
          "requested_local_time", "created_by_type", "updated_at")
        VALUES (${newId()}::uuid, ${userId}::uuid, ${draft.id}::uuid, ${version.id}::uuid, NULL,
          'America/Sao_Paulo', '2026-10-20T09:00', 'USER', now())`,
      NOT_NULL,
    );
    await expectRejects(
      prisma.schedule.create({
        data: {
          id: newId(),
          userId,
          draftId: draft.id,
          draftVersionId: version.id,
          scheduledAt: new Date("2026-10-20T12:00:00Z"),
          timezone: "  ",
          requestedLocalTime: "2026-10-20T09:00",
          createdByType: "USER",
        },
      }),
      CHECK,
    );
  });

  it("allows at most one PENDING schedule per draft", async () => {
    const { userId, draft, version } = await createDraftWithVersion();
    const data = {
      userId,
      draftId: draft.id,
      draftVersionId: version.id,
      scheduledAt: new Date("2026-10-20T12:00:00Z"),
      timezone: "America/Sao_Paulo",
      requestedLocalTime: "2026-10-20T09:00",
      createdByType: "USER" as const,
    };
    await prisma.schedule.create({ data: { id: newId(), ...data, status: "CANCELLED" } });
    await prisma.schedule.create({ data: { id: newId(), ...data, status: "PENDING" } });
    await expectRejects(
      prisma.schedule.create({ data: { id: newId(), ...data, status: "PENDING" } }),
      UNIQUE,
    );
  });
});

describe("publications (I8) and approvals (I5)", () => {
  it("never two active publications of the same draft (IN_PROGRESS, SUCCEEDED, AMBIGUOUS)", async () => {
    const { userId, draft, version } = await createDraftWithVersion();
    const data = { userId, draftId: draft.id, draftVersionId: version.id };
    const create = (status: "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "AMBIGUOUS") =>
      prisma.publication.create({
        data: { id: newId(), ...data, idempotencyKey: `k:${newId()}`, status },
      });
    await create("FAILED");
    await create("PENDING");
    const succeeded = await create("SUCCEEDED");
    await expectRejects(create("IN_PROGRESS"), UNIQUE);
    await expectRejects(create("AMBIGUOUS"), UNIQUE);
    // An AMBIGUOUS outcome blocks a new attempt exactly like a success does (ADR-0003 §5).
    await prisma.publication.update({ where: { id: succeeded.id }, data: { status: "AMBIGUOUS" } });
    await expectRejects(create("IN_PROGRESS"), UNIQUE);
    await expectRejects(create("SUCCEEDED"), UNIQUE);
    await prisma.publication.update({ where: { id: succeeded.id }, data: { status: "FAILED" } });
    await expect(create("IN_PROGRESS")).resolves.toBeTruthy();
  });

  it("SYSTEM approvals require reason and policy snapshot; USER approvals require the user", async () => {
    const { userId, draft, version } = await createDraftWithVersion();
    const base = {
      userId,
      draftId: draft.id,
      draftVersionId: version.id,
      decision: "APPROVED" as const,
    };
    await expectRejects(
      prisma.approval.create({
        data: { id: newId(), ...base, actorType: "SYSTEM", autonomyMode: "AUTOPILOT_CONTROLLED" },
      }),
      CHECK,
    );
    await expectRejects(
      prisma.approval.create({
        data: { id: newId(), ...base, actorType: "USER", autonomyMode: "ASSISTED" },
      }),
      CHECK,
    );
    await expect(
      prisma.approval.create({
        data: {
          id: newId(),
          ...base,
          actorType: "SYSTEM",
          autonomyMode: "AUTOPILOT_CONTROLLED",
          reason: "score 92 ≥ 85 in allowed pillar",
          policySnapshot: { mode: "AUTOPILOT_CONTROLLED" },
        },
      }),
    ).resolves.toBeTruthy();
  });

  it("source_items are always untrusted (CHECK)", async () => {
    const userId = seededUserId;
    const source = await prisma.source.findFirstOrThrow({ where: { userId } });
    await expectRejects(
      prisma.$executeRaw`
        INSERT INTO "source_items" ("id", "source_id", "user_id", "external_id", "canonical_url", "title",
          "content_text", "content_hash", "untrusted")
        VALUES (${newId()}::uuid, ${source.id}::uuid, ${userId}::uuid, 'x', 'https://example.com/x', 't',
          'c', repeat('a', 64), false)`,
      CHECK,
    );
  });
});

describe("manual publications (T-039, migration 20261021210000)", () => {
  const manual = (userId: string, data: Record<string, unknown> = {}) =>
    prisma.publication.create({
      data: {
        id: newId(),
        userId,
        idempotencyKey: `pub:manual:${userId}:${newId()}`,
        body: "Texto escrito pelo Rodrigo",
        ...data,
      },
    });

  it("accept free text without a draft and require exactly one origin", async () => {
    const { userId, draft, version } = await createDraftWithVersion();
    await expect(manual(userId)).resolves.toMatchObject({ draftId: null, draftVersionId: null });
    await expectRejects(manual(userId, { body: null }), CHECK);
    await expectRejects(manual(userId, { draftId: draft.id, draftVersionId: version.id }), CHECK);
    await expectRejects(manual(userId, { body: null, draftId: draft.id }), CHECK);
  });

  it("bound the text to 1..3000 characters", async () => {
    const { userId } = await createDraftWithVersion();
    await expectRejects(manual(userId, { body: "" }), CHECK);
    await expectRejects(manual(userId, { body: "a".repeat(3001) }), CHECK);
    await expect(manual(userId, { body: "a".repeat(3000) })).resolves.toBeTruthy();
  });

  it("rollback refuses to run while manual publications exist, then restores NOT NULL", async () => {
    // Own database: the rollback must not disturb the shared one.
    const name = `rollback_${newId().replaceAll("-", "")}`;
    await prisma.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    const url = new URL(databaseUrl);
    url.pathname = `/${name}`;
    migrateDeploy(url.toString());
    const client = new pg.Client({ connectionString: url.toString() });
    await client.connect();
    try {
      const downSql = readFileSync(
        fileURLToPath(
          new URL(
            "../../prisma/migrations/20261021210000_manual_publications/down.sql",
            import.meta.url,
          ),
        ),
        "utf8",
      );
      const userId = newId();
      await client.query(
        `INSERT INTO "users" ("id", "email", "password_hash", "name", "updated_at")
         VALUES ($1, $2, 'x', 'R', now())`,
        [userId, `rollback-${userId}@example.com`],
      );
      await client.query(
        `INSERT INTO "publications" ("id", "user_id", "idempotency_key", "body", "updated_at")
         VALUES ($1, $2, $3, 'texto', now())`,
        [newId(), userId, `pub:manual:${userId}:${newId()}`],
      );
      await expect(client.query(downSql)).rejects.toThrow(/manual publications exist/);
      await client.query(`DELETE FROM "publications"`);
      await client.query(downSql);
      const columns = await client.query<{ column_name: string; is_nullable: string }>(
        `SELECT column_name, is_nullable FROM information_schema.columns
         WHERE table_name = 'publications' AND column_name IN ('body', 'draft_id', 'draft_version_id')
         ORDER BY column_name`,
      );
      expect(columns.rows).toEqual([
        { column_name: "draft_id", is_nullable: "NO" },
        { column_name: "draft_version_id", is_nullable: "NO" },
      ]);
    } finally {
      await client.end();
      await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    }
  });
});

describe("encrypted-at-rest envelopes (ADR-0004 framing, cipher in T-052)", () => {
  it("users TOTP envelope is all-or-none", async () => {
    const { userId } = await createDraftWithVersion();
    await expectRejects(
      prisma.user.update({
        where: { id: userId },
        data: { totpSecretCiphertext: Buffer.from([1]) },
      }),
      CHECK,
    );
    await expect(
      prisma.user.update({
        where: { id: userId },
        data: {
          totpSecretCiphertext: Buffer.from([1]),
          totpWrappedDek: Buffer.from([2]),
          totpKeyVersion: "1",
        },
      }),
    ).resolves.toBeTruthy();
  });

  it("oauth_states code_verifier ciphertext requires its key version", async () => {
    const { userId } = await createDraftWithVersion();
    const session = await prisma.session.create({
      data: {
        id: newId(),
        userId,
        secretHash: `h:${newId()}`,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const base = {
      userId,
      sessionId: session.id,
      stateHash: `s:${newId()}`,
      expiresAt: new Date(Date.now() + 600_000),
    };
    await expectRejects(
      prisma.oAuthState.create({
        data: { id: newId(), ...base, codeVerifierCiphertext: Buffer.from([1]) },
      }),
      CHECK,
    );
    await expect(
      prisma.oAuthState.create({
        data: {
          id: newId(),
          ...base,
          stateHash: `s:${newId()}`,
          codeVerifierCiphertext: Buffer.from([1]),
          codeVerifierKeyVersion: "1",
        },
      }),
    ).resolves.toBeTruthy();
  });
});

describe("voice profiles", () => {
  it("default to inactive and allow one active version per user", async () => {
    const { userId, voice } = await createDraftWithVersion();
    expect(voice.isActive).toBe(false);
    await prisma.voiceProfile.update({ where: { id: voice.id }, data: { isActive: true } });
    await expectRejects(
      prisma.voiceProfile.create({
        data: { id: newId(), userId, version: 2, tone: "v2", isActive: true },
      }),
      UNIQUE,
    );
    await expect(
      prisma.voiceProfile.create({ data: { id: newId(), userId, version: 2, tone: "v2" } }),
    ).resolves.toBeTruthy();
  });
});
