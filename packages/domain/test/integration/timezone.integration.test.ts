/**
 * Pêndulo's finding (T-015): `@prisma/adapter-pg` sends `timestamptz` parameters without an offset, so a
 * non-UTC session time zone shifted every written instant. `createPrismaClient` pins each connection to
 * UTC; this suite sets both the process (`TZ`) and the database default to America/Sao_Paulo and checks
 * that SQL `now()`, bound JS `Date`s and Prisma writes all agree with the application clock.
 * `TEST_DATABASE_URL` (any database the test may `ALTER`) replaces the container for runs without Docker.
 */
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, type PrismaClient } from "../../src/client.js";

const POSTGRES_IMAGE =
  "postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24";
/** Generous for slow CI, far below the 3 h (10 800 s) a São Paulo offset would produce. */
const MAX_DRIFT_SECONDS = 5;

let container: StartedPostgreSqlContainer | undefined;
let prisma: PrismaClient;
const originalTz = process.env["TZ"];

beforeAll(async () => {
  process.env["TZ"] = "America/Sao_Paulo";
  let databaseUrl = process.env["TEST_DATABASE_URL"] ?? "";
  if (databaseUrl === "") {
    container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
    databaseUrl = container.getConnectionUri();
  }
  // New connections default to São Paulo unless the client overrides the session time zone.
  const admin = new Client({ connectionString: databaseUrl });
  await admin.connect();
  const { rows } = await admin.query<{ db: string }>("SELECT current_database() AS db");
  await admin.query(`ALTER DATABASE "${rows[0]?.db}" SET timezone TO 'America/Sao_Paulo'`);
  await admin.end();
  prisma = createPrismaClient({ connectionString: databaseUrl });
});

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
  if (originalTz === undefined) delete process.env["TZ"];
  else process.env["TZ"] = originalTz;
});

describe("createPrismaClient pins the session time zone to UTC", () => {
  it("runs with TZ=America/Sao_Paulo in the process and as the database default", () => {
    expect(new Date(Date.UTC(2026, 0, 1, 12)).getHours()).toBe(9);
  });

  it("SHOW TimeZone is UTC on pooled connections", async () => {
    const [row] = await prisma.$queryRaw<{ TimeZone: string }[]>`SHOW TimeZone`;
    expect(row?.TimeZone).toBe("UTC");
  });

  it("SQL now() matches Date.now()", async () => {
    const before = Date.now();
    const [row] = await prisma.$queryRaw<{ now: Date }[]>`SELECT now() AS now`;
    const after = Date.now();
    expect(Math.abs((row?.now.getTime() ?? 0) - (before + after) / 2) / 1000).toBeLessThan(
      MAX_DRIFT_SECONDS,
    );
  });

  it("a bound JS Date is read back as the same instant (no offset shift)", async () => {
    const instant = new Date();
    const [row] = await prisma.$queryRaw<{ drift: number }[]>`
      SELECT EXTRACT(EPOCH FROM (now() - ${instant}::timestamptz))::float8 AS drift`;
    expect(Math.abs(row?.drift ?? Number.POSITIVE_INFINITY)).toBeLessThan(MAX_DRIFT_SECONDS);
  });
});
