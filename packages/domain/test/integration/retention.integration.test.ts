/**
 * T-063 `retention.purge` against a real PostgreSQL, with a fake clock: only the categories whose period is
 * fixed in an ADR, a spec or code (docs/security/data-inventory.md §2) are purged, exactly once their period is
 * over and never before; a dry run deletes nothing; what has no defined period (login throttles, publications,
 * audit) is never touched.
 *
 * Without Docker, point `INTEGRATION_DATABASE_URL` at a server the user may create databases on; this file creates
 * its own database there and drops it afterwards.
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient, type PrismaClient } from "../../src/client.js";
import { newId } from "../../src/ids.js";
import { PrismaRetentionPurge } from "../../src/retention/purge.js";

const PACKAGE_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const PRISMA_BIN = fileURLToPath(new URL("../../node_modules/.bin/prisma", import.meta.url));
const POSTGRES_IMAGE =
  "postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const T0 = new Date("2026-10-23T07:00:00.000Z");

let container: StartedPostgreSqlContainer | undefined;
let created: { adminUrl: string; name: string } | undefined;
let prisma: PrismaClient;
let clock: Date;
let purge: PrismaRetentionPurge;
let userId: string;

const ago = (ms: number) => new Date(clock.getTime() - ms);

async function owner(): Promise<string> {
  const id = newId();
  await prisma.user.create({
    data: { id, email: `retention-${id}@example.test`, passwordHash: "x", name: "Retention" },
  });
  return id;
}

async function session(data: {
  createdAt: Date;
  expiresAt: Date;
  revokedAt?: Date | null;
}): Promise<string> {
  const id = newId();
  await prisma.session.create({
    data: {
      id,
      userId,
      secretHash: newId(),
      createdAt: data.createdAt,
      expiresAt: data.expiresAt,
      lastSeenAt: data.createdAt,
      revokedAt: data.revokedAt ?? null,
      ip: "203.0.113.9",
      userAgent: "vitest",
    },
  });
  return id;
}

async function oauthState(data: { expiresAt: Date; usedAt?: Date | null }): Promise<string> {
  const sessionId = await session({ createdAt: clock, expiresAt: new Date(clock.getTime() + DAY) });
  const id = newId();
  await prisma.oAuthState.create({
    data: {
      id,
      userId,
      sessionId,
      stateHash: newId(),
      nonceHash: newId(),
      createdAt: ago(10 * 60 * 1000),
      expiresAt: data.expiresAt,
      usedAt: data.usedAt ?? null,
    },
  });
  return id;
}

async function idempotencyKey(expiresAt: Date): Promise<string> {
  const id = newId();
  await prisma.idempotencyKey.create({
    data: {
      id,
      userId,
      route: "publications.publishNow",
      key: newId(),
      requestHash: "0".repeat(64),
      createdAt: ago(DAY),
      expiresAt,
    },
  });
  return id;
}

async function throttle(key: string, updatedAt: Date, lockedUntil: Date | null = null) {
  await prisma.loginThrottle.create({
    data: { key, failures: 1, windowStartedAt: updatedAt, lockedUntil, updatedAt },
  });
}

const exists = {
  session: async (id: string) => (await prisma.session.count({ where: { id } })) === 1,
  oauthState: async (id: string) => (await prisma.oAuthState.count({ where: { id } })) === 1,
  idempotencyKey: async (id: string) =>
    (await prisma.idempotencyKey.count({ where: { id } })) === 1,
  throttle: async (key: string) => (await prisma.loginThrottle.count({ where: { key } })) === 1,
};

beforeAll(async () => {
  let databaseUrl: string;
  const external = process.env.INTEGRATION_DATABASE_URL;
  if (external) {
    const name = `retention_${Date.now()}`;
    const admin = createPrismaClient({ connectionString: external, maxConnections: 1 });
    try {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    } finally {
      await admin.$disconnect();
    }
    created = { adminUrl: external, name };
    const url = new URL(external);
    url.pathname = `/${name}`;
    databaseUrl = url.toString();
  } else {
    container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
    databaseUrl = container.getConnectionUri();
  }
  execFileSync(PRISMA_BIN, ["migrate", "deploy"], {
    cwd: PACKAGE_ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: ["ignore", "pipe", "pipe"],
  });
  prisma = createPrismaClient({ connectionString: databaseUrl, maxConnections: 4 });
  purge = new PrismaRetentionPurge(prisma, () => clock);
});

beforeEach(async () => {
  clock = T0;
  // Each test starts from empty tables of the purged categories, so the counts are exact.
  await prisma.oAuthState.deleteMany();
  await prisma.idempotencyKey.deleteMany();
  await prisma.session.deleteMany();
  await prisma.loginThrottle.deleteMany();
  userId = await owner();
});

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
  if (created) {
    const admin = createPrismaClient({ connectionString: created.adminUrl, maxConnections: 1 });
    try {
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${created.name}" WITH (FORCE)`);
    } finally {
      await admin.$disconnect();
    }
  }
});

describe("retention.purge (T-063, defined periods only)", () => {
  it("sessions: once expired (idle), revoked or past the 30-day absolute end (ADR-0007), never before", async () => {
    const minute = 60 * 1000;
    const expired = await session({ createdAt: ago(10 * DAY), expiresAt: ago(minute) });
    const revoked = await session({
      createdAt: ago(2 * DAY),
      expiresAt: new Date(clock.getTime() + DAY),
      revokedAt: ago(minute),
    });
    // Past the absolute lifetime (30 days from the first login) even with a later expires_at.
    const pastAbsolute = await session({
      createdAt: ago(30 * DAY + minute),
      expiresAt: new Date(clock.getTime() + DAY),
    });
    const nearAbsolute = await session({
      createdAt: ago(30 * DAY - minute),
      expiresAt: new Date(clock.getTime() + minute),
    });
    const active = await session({
      createdAt: ago(DAY),
      expiresAt: new Date(clock.getTime() + DAY),
    });

    const result = await purge.run({ dryRun: false });
    expect(result.sessions).toBe(3);
    expect(await exists.session(expired)).toBe(false);
    expect(await exists.session(revoked)).toBe(false);
    expect(await exists.session(pastAbsolute)).toBe(false);
    expect(await exists.session(nearAbsolute)).toBe(true);
    expect(await exists.session(active)).toBe(true);
  });

  it("oauth_states: once expired (10 min) or used", async () => {
    const expired = await oauthState({ expiresAt: ago(1000) });
    const used = await oauthState({
      expiresAt: new Date(clock.getTime() + HOUR),
      usedAt: ago(1000),
    });
    const pending = await oauthState({ expiresAt: new Date(clock.getTime() + 5 * 60 * 1000) });

    const result = await purge.run({ dryRun: false });
    expect(result.oauthStates).toBe(2);
    expect(await exists.oauthState(expired)).toBe(false);
    expect(await exists.oauthState(used)).toBe(false);
    expect(await exists.oauthState(pending)).toBe(true);
  });

  it("idempotency_keys: once expired (expires_at = created_at + 24 h)", async () => {
    const expired = await idempotencyKey(ago(1000));
    const valid = await idempotencyKey(new Date(clock.getTime() + HOUR));
    const result = await purge.run({ dryRun: false });
    expect(result.idempotencyKeys).toBe(1);
    expect(await exists.idempotencyKey(expired)).toBe(false);
    expect(await exists.idempotencyKey(valid)).toBe(true);
  });

  it("login_throttles are not purged: their 90 days are only proposed (D1)", async () => {
    await throttle("email:old", ago(365 * DAY));
    const result = await purge.run({ dryRun: false });
    expect(result).not.toHaveProperty("loginThrottles");
    expect(await exists.throttle("email:old")).toBe(true);
  });

  it("a dry run counts what would go and deletes nothing, and writes no audit", async () => {
    const expired = await session({ createdAt: ago(10 * DAY), expiresAt: ago(2 * DAY) });
    const key = await idempotencyKey(ago(1000));
    const auditBefore = await prisma.auditEvent.count();
    const result = await purge.run({ dryRun: true });
    expect(result).toMatchObject({ dryRun: true, sessions: 1, idempotencyKeys: 1 });
    expect(await exists.session(expired)).toBe(true);
    expect(await exists.idempotencyKey(key)).toBe(true);
    expect(await prisma.auditEvent.count()).toBe(auditBefore);
  });

  it("is idempotent and audits each real run with counts only", async () => {
    await session({ createdAt: ago(10 * DAY), expiresAt: ago(2 * DAY) });
    const first = await purge.run({ dryRun: false });
    const second = await purge.run({ dryRun: false });
    expect(first.sessions).toBe(1);
    expect(second).toMatchObject({ sessions: 0, oauthStates: 0, idempotencyKeys: 0 });
    const events = await prisma.auditEvent.findMany({ where: { action: "retention.purged" } });
    // The second run deleted nothing: no event.
    expect(events.at(-1)).toMatchObject({
      actorType: "SYSTEM",
      userId: null,
      entityType: "retention",
      after: { sessions: 1, oauthStates: 0, idempotencyKeys: 0 },
    });
    expect(JSON.stringify(events.at(-1))).not.toContain("203.0.113.9");
  });

  it("never touches publications nor audit events, whatever their age", async () => {
    const publication = await prisma.publication.create({
      data: {
        id: newId(),
        userId,
        body: "Post publicado há muito tempo.",
        idempotencyKey: newId(),
        status: "SUCCEEDED",
        createdAt: ago(800 * DAY),
        updatedAt: ago(800 * DAY),
      },
    });
    const audit = await prisma.auditEvent.create({
      data: {
        id: newId(),
        userId,
        actorType: "USER",
        actorId: userId,
        action: "auth.login",
        entityType: "session",
        correlationId: "req_old",
        createdAt: ago(800 * DAY),
      },
    });
    await purge.run({ dryRun: false });
    expect(await prisma.publication.count({ where: { id: publication.id } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { id: audit.id } })).toBe(1);
  });
});
