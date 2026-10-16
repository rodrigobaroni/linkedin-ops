/**
 * T-005 acceptance evidence, against a real PostgreSQL (Testcontainers, postgres:17-alpine):
 * - `prisma migrate deploy` applies the baseline from scratch and the seed is idempotent;
 * - unique indexes: publications.idempotency_key, (curation_runs.user_id, scheduled_for, trigger),
 *   (sources.user_id, canonical_url);
 * - draft_versions, approvals and audit_events are append-only (UPDATE/DELETE/TRUNCATE rejected);
 * - schedules.scheduled_at + timezone are mandatory;
 * - partial unique indexes I7/I8, CHECK I5 and enum database values.
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seed } from "../../prisma/seed.js";
import { createPrismaClient, type PrismaClient } from "../../src/client.js";
import { newId } from "../../src/ids.js";

const PACKAGE_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const PRISMA_BIN = fileURLToPath(new URL("../../node_modules/.bin/prisma", import.meta.url));
const POSTGRES_IMAGE = "postgres:17-alpine";

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

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let userId: string;

/** Fixture: voice profile → curation run → opportunity → draft → version 1 (owned by the seeded user). */
async function createDraftWithVersion() {
  const pillar = await prisma.contentPillar.findFirstOrThrow({ where: { userId } });
  const voice = await prisma.voiceProfile.create({
    data: { id: newId(), userId, version: 1, isActive: false, tone: "fixture" },
  });
  const run = await prisma.curationRun.create({
    data: { id: newId(), userId, scheduledFor: new Date(), trigger: "MANUAL", status: "SUCCEEDED" },
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
  return { draft, version, opportunity, run };
}

beforeAll(async () => {
  container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  const url = container.getConnectionUri();
  const output = migrateDeploy(url);
  expect(output).toMatch(/20261016120000_init/);
  prisma = createPrismaClient({ connectionString: url, maxConnections: 4 });
  userId = (await seed(prisma)).userId;
});

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

describe("migration baseline", () => {
  it("applies the initial migration from scratch and enables citext", async () => {
    const migrations = await prisma.$queryRaw<{ name: string; finished: boolean }[]>`
      SELECT migration_name AS name, finished_at IS NOT NULL AS finished FROM _prisma_migrations`;
    expect(migrations).toEqual([{ name: "20261016120000_init", finished: true }]);
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
    expect(again.userId).toBe(userId);
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
    expect(user?.id).toBe(userId);
    expect(user?.passwordHash).toMatch(/^\$argon2id\$/);
  });
});

describe("unique indexes (acceptance criteria)", () => {
  it("publications.idempotency_key is unique", async () => {
    const { draft, version } = await createDraftWithVersion();
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
        email: "second@example.com",
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

  it("approvals rejects UPDATE and DELETE", async () => {
    const { draft, version } = await createDraftWithVersion();
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
  });

  it("audit_events rejects UPDATE and DELETE", async () => {
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
  });
});

describe("schedules (I6, I7)", () => {
  it("scheduled_at and timezone are mandatory", async () => {
    const { draft, version } = await createDraftWithVersion();
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
    const { draft, version } = await createDraftWithVersion();
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
  it("never two active publications of the same draft", async () => {
    const { draft, version } = await createDraftWithVersion();
    const data = { userId, draftId: draft.id, draftVersionId: version.id };
    await prisma.publication.create({
      data: { id: newId(), ...data, idempotencyKey: `k:${newId()}`, status: "FAILED" },
    });
    await prisma.publication.create({
      data: { id: newId(), ...data, idempotencyKey: `k:${newId()}`, status: "SUCCEEDED" },
    });
    await expectRejects(
      prisma.publication.create({
        data: { id: newId(), ...data, idempotencyKey: `k:${newId()}`, status: "IN_PROGRESS" },
      }),
      UNIQUE,
    );
  });

  it("SYSTEM approvals require reason and policy snapshot; USER approvals require the user", async () => {
    const { draft, version } = await createDraftWithVersion();
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
