/**
 * `LoginThrottle` against a real PostgreSQL, under the interleavings of #105: a successful authentication
 * clears the keys (`reset`) while a concurrent attempt is locking them. In READ COMMITTED a `SELECT … FOR
 * UPDATE` that waited on a row deleted meanwhile does not return it; the attempt must still be counted (or
 * refused), never fail.
 *
 * Without Docker, point `INTEGRATION_DATABASE_URL` at a server the user may create databases on; this file
 * then creates its own empty database there.
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LoginThrottle, THROTTLE_MAX_FAILURES } from "../../src/auth/login-throttle.js";
import { createPrismaClient, type PrismaClient } from "../../src/client.js";

const PACKAGE_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const PRISMA_BIN = fileURLToPath(new URL("../../node_modules/.bin/prisma", import.meta.url));
const POSTGRES_IMAGE =
  "postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24";

let container: StartedPostgreSqlContainer | undefined;
let databaseUrl: string;
/** Server and name of the database this file created on `INTEGRATION_DATABASE_URL` (dropped afterwards). */
let created: { adminUrl: string; name: string } | undefined;
let prisma: PrismaClient;
let throttle: LoginThrottle;

beforeAll(async () => {
  const external = process.env.INTEGRATION_DATABASE_URL;
  if (external) {
    const name = `login_throttle_${Date.now()}`;
    const admin = new pg.Client({ connectionString: external });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${name}"`);
    await admin.end();
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
  prisma = createPrismaClient({ connectionString: databaseUrl, maxConnections: 8 });
  throttle = new LoginThrottle(prisma, () => new Date());
});

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
  if (created) {
    const admin = new pg.Client({ connectionString: created.adminUrl });
    await admin.connect();
    try {
      await admin.query(`DROP DATABASE IF EXISTS "${created.name}" WITH (FORCE)`);
    } finally {
      await admin.end();
    }
  }
});

/** Waits until a backend of this database is blocked on a lock (the attempt reached its row lock). */
async function waitForLockWait(client: pg.Client): Promise<void> {
  for (let i = 0; i < 200; i += 1) {
    const { rows } = await client.query<{ n: string }>(
      `SELECT count(*) AS n FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'`,
    );
    if (Number(rows[0]?.n ?? 0) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("the attempt never waited on the row lock");
}

describe("LoginThrottle under a concurrent reset (#105)", () => {
  it("counts an attempt whose keys were deleted while it waited for their locks", async () => {
    const keys = ["reauth:race-user", "ip:race-ip"];
    // Rows exist (an earlier attempt counted in them), so the attempt's INSERT … DO NOTHING inserts nothing.
    expect(await throttle.consume(keys)).toBeNull();

    // The winner of the race: holds the rows, as `reset` does while deleting them, then commits the delete.
    const winner = new pg.Client({ connectionString: databaseUrl });
    await winner.connect();
    const observer = new pg.Client({ connectionString: databaseUrl });
    await observer.connect();
    try {
      await winner.query("BEGIN");
      await winner.query(
        `SELECT "key" FROM "login_throttles" WHERE "key" = ANY($1::text[]) ORDER BY "key" FOR UPDATE`,
        [keys],
      );
      const attempt = throttle.consume(keys);
      await waitForLockWait(observer);
      await winner.query(`DELETE FROM "login_throttles" WHERE "key" = ANY($1::text[])`, [keys]);
      await winner.query("COMMIT");

      await expect(attempt).resolves.toBeNull();
    } finally {
      await winner.end();
      await observer.end();
    }
    const rows = await prisma.loginThrottle.findMany({ where: { key: { in: keys } } });
    expect(rows.map((row) => [row.key, row.failures]).sort()).toEqual([
      ["ip:race-ip", 1],
      ["reauth:race-user", 1],
    ]);
  });

  it("concurrent attempts and resets on overlapping keys never fail nor deadlock", async () => {
    const userKeys = (n: number) => [`reauth:loop-user-${n % 3}`, "ip:loop-shared"];
    const work: Promise<unknown>[] = [];
    for (let i = 0; i < 300; i += 1) {
      work.push(throttle.consume(userKeys(i)));
      if (i % 4 === 0) work.push(throttle.reset(userKeys(i + 1)));
    }
    const settled = await Promise.allSettled(work);
    expect(settled.filter((result) => result.status === "rejected")).toEqual([]);
    // No key ever counts past the lock threshold without being locked.
    const rows = await prisma.loginThrottle.findMany();
    for (const row of rows) {
      if (row.failures >= THROTTLE_MAX_FAILURES) expect(row.lockedUntil).not.toBeNull();
    }
  });
});
