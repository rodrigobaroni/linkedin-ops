/**
 * Career PR 3a evidence for `PrismaFetchDomainGuard` (ADR-0008 §4), against a real PostgreSQL:
 * - the state survives a restart (a new client sees the same quota and breaker);
 * - concurrent hops to one domain never both pass the interval, and never exceed the 40/24 h LinkedIn quota;
 * - a breaker tripped concurrently with acquires is never lost; different domains never block each other;
 * - the kill switch writes nothing; the CHECKs reject a URL as key, an unknown signal and a 41st window entry;
 * - with TZ and the database default at America/Sao_Paulo, stored instants match the application clock.
 *
 * Without Docker, point `INTEGRATION_DATABASE_URL` at a server the user may create databases on; this file creates
 * its own database there (so the migration always runs on an empty one) and drops it afterwards.
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient, type PrismaClient } from "../../src/client.js";
import { FETCH_BREAKER_OPEN_MS, FETCH_QUOTA_WINDOW_MS } from "../../src/career/fetch-domain.js";
import { PrismaFetchDomainGuard } from "../../src/career/prisma-fetch-domain-guard.js";
import type { FetchSlot } from "../../src/career/ports.js";

const PACKAGE_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const PRISMA_BIN = fileURLToPath(new URL("../../node_modules/.bin/prisma", import.meta.url));
const POSTGRES_IMAGE =
  "postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24";
const CHECK = /23514|check constraint/i;

const T0 = new Date("2026-10-22T12:00:00.000Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

let container: StartedPostgreSqlContainer | undefined;
/** Server and name of the database this file created on `INTEGRATION_DATABASE_URL` (dropped afterwards). */
let created: { adminUrl: string; name: string } | undefined;
let databaseUrl: string;
let prisma: PrismaClient;
const originalTz = process.env["TZ"];

/** A guard on its own pool, as a separate worker process would have. */
function guardAt(
  now: () => Date,
  linkedInFetch: "enabled" | "disabled" = "enabled",
  client: PrismaClient = prisma,
) {
  return new PrismaFetchDomainGuard(client, now, { linkedInFetch });
}

const outcomes = (slots: FetchSlot[]) => slots.map((slot) => slot.outcome).sort();

beforeAll(async () => {
  process.env["TZ"] = "America/Sao_Paulo";
  const external = process.env["INTEGRATION_DATABASE_URL"];
  if (external) {
    const name = `fetch_domain_guard_${Date.now()}`;
    const admin = new Client({ connectionString: external });
    await admin.connect();
    try {
      await admin.query(`CREATE DATABASE "${name}"`);
    } finally {
      await admin.end();
    }
    created = { adminUrl: external, name };
    const url = new URL(external);
    url.pathname = `/${name}`;
    databaseUrl = url.toString();
  } else {
    container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
    databaseUrl = container.getConnectionUri();
  }
  // New connections default to São Paulo unless the client overrides the session time zone.
  const admin = new Client({ connectionString: databaseUrl });
  await admin.connect();
  const { rows } = await admin.query<{ db: string }>("SELECT current_database() AS db");
  await admin.query(`ALTER DATABASE "${rows[0]?.db}" SET timezone TO 'America/Sao_Paulo'`);
  await admin.end();
  const output = execFileSync(PRISMA_BIN, ["migrate", "deploy"], {
    cwd: PACKAGE_ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  expect(output).toMatch(/20261022230000_job_fetch_domain_state/);
  prisma = createPrismaClient({ connectionString: databaseUrl, maxConnections: 12 });
});

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
  if (created) {
    const admin = new Client({ connectionString: created.adminUrl });
    await admin.connect();
    try {
      await admin.query(`DROP DATABASE IF EXISTS "${created.name}" WITH (FORCE)`);
    } finally {
      await admin.end();
    }
  }
  if (originalTz === undefined) delete process.env["TZ"];
  else process.env["TZ"] = originalTz;
});

beforeEach(async () => {
  await prisma.jobFetchDomainState.deleteMany();
});

describe("PrismaFetchDomainGuard", () => {
  it("grants, then makes the next hop wait, with instants stored as the application clock", async () => {
    let now = T0;
    const guard = guardAt(() => now);
    expect(await guard.acquire("www.linkedin.com")).toEqual({ outcome: "granted" });
    now = at(10_000);
    expect(await guard.acquire("lnkd.in")).toEqual({ outcome: "wait", retryAt: at(15_000) });
    now = at(15_000);
    expect(await guard.acquire("linkedin.com")).toEqual({ outcome: "granted" });

    const [row] = await prisma.$queryRaw<{ last: string; recent: string[] }[]>`
      SELECT to_char("last_request_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS last,
             ARRAY(SELECT to_char(t AT TIME ZONE 'UTC', 'HH24:MI:SS') FROM unnest("recent_requests") t) AS recent
      FROM "job_fetch_domain_state" WHERE "domain" = 'linkedin.com'`;
    expect(row).toEqual({ last: "2026-10-22T12:00:15.000", recent: ["12:00:00", "12:00:15"] });
  });

  it("keeps quota and breaker across a restart (a new client)", async () => {
    let now = T0;
    for (let i = 0; i < 40; i += 1) {
      now = at(i * 15_000);
      expect(await guardAt(() => now).acquire("linkedin.com")).toEqual({ outcome: "granted" });
    }
    await guardAt(() => now).tripBreaker("gupy.io", "http_429");

    const restarted = createPrismaClient({ connectionString: databaseUrl, maxConnections: 2 });
    try {
      now = at(40 * 15_000);
      const guard = guardAt(() => now, "enabled", restarted);
      expect(await guard.acquire("linkedin.com")).toEqual({
        outcome: "quota_exhausted",
        retryAt: at(FETCH_QUOTA_WINDOW_MS),
      });
      expect(await guard.acquire("acme.gupy.io")).toEqual({
        outcome: "breaker_open",
        until: at(39 * 15_000 + FETCH_BREAKER_OPEN_MS),
        signal: "http_429",
      });
    } finally {
      await restarted.$disconnect();
    }
  });

  it.each([
    ["a new row", false],
    // An existing row is the case only `FOR UPDATE` serializes (the insert conflict does not).
    ["an existing row", true],
  ])("lets exactly one of N concurrent hops to the same domain through (%s)", async (_, seeded) => {
    if (seeded) await guardAt(() => at(-60 * 60 * 1000)).acquire("linkedin.com");
    const guard = guardAt(() => T0);
    const slots = await Promise.all(
      Array.from({ length: 10 }, (_, i) => guard.acquire(i % 2 ? "www.linkedin.com" : "lnkd.in")),
    );
    expect(outcomes(slots)).toEqual(["granted", ...Array<string>(9).fill("wait")]);
  });

  it("never grants more than 40 LinkedIn requests in 24 h under concurrency", async () => {
    // Each call reads a clock 15 s after the previous one, so only the quota can refuse in order.
    let tick = 0;
    const guard = guardAt(() => at(tick++ * 15_000));
    const slots = await Promise.all(
      Array.from({ length: 60 }, () => guard.acquire("linkedin.com")),
    );
    const granted = slots.filter((slot) => slot.outcome === "granted").length;
    expect(granted).toBeGreaterThan(0);
    expect(granted).toBeLessThanOrEqual(40);
    const [row] = await prisma.$queryRaw<{ n: number }[]>`
      SELECT cardinality("recent_requests") AS n FROM "job_fetch_domain_state"
      WHERE "domain" = 'linkedin.com'`;
    expect(row?.n).toBe(granted);
  });

  it("never loses a breaker tripped concurrently with acquires", async () => {
    let tick = 0;
    const guard = guardAt(() => at(tick++ * 5_000));
    const results = await Promise.all([
      ...Array.from({ length: 5 }, () => guard.acquire("greenhouse.io")),
      guard.tripBreaker("boards.greenhouse.io", "http_403"),
      ...Array.from({ length: 5 }, () => guard.acquire("greenhouse.io")),
      guard.tripBreaker("greenhouse.io", "login_wall"),
    ]);
    const trips = results.filter((r): r is { openUntil: Date } => "openUntil" in r);
    const latest = Math.max(...trips.map((t) => t.openUntil.getTime()));
    const after = await guardAt(() => at(60 * 60 * 1000)).acquire("greenhouse.io");
    expect(after).toMatchObject({ outcome: "breaker_open", until: new Date(latest) });
  });

  it("does not let one domain block another", async () => {
    const guard = guardAt(() => T0);
    const slots = await Promise.all(
      ["linkedin.com", "gupy.io", "lever.co", "greenhouse.io"].map((d) => guard.acquire(d)),
    );
    expect(outcomes(slots)).toEqual(Array<string>(4).fill("granted"));
  });

  it("answers disabled for LinkedIn without writing any state", async () => {
    const guard = guardAt(() => T0, "disabled");
    expect(await guard.acquire("lnkd.in")).toEqual({ outcome: "disabled" });
    expect(await guard.acquire("gupy.io")).toEqual({ outcome: "granted" });
    const domains = await prisma.jobFetchDomainState.findMany({ select: { domain: true } });
    expect(domains).toEqual([{ domain: "gupy.io" }]);
  });
});

describe("job_fetch_domain_state CHECKs", () => {
  const insert = (domain: string, extra: Record<string, unknown> = {}) =>
    prisma.jobFetchDomainState.create({ data: { domain, updatedAt: T0, ...extra } });

  it("accepts a normalized domain and rejects a URL, uppercase or whitespace as key", async () => {
    await insert("linkedin.com");
    for (const bad of ["https://linkedin.com/jobs", "LinkedIn.com", "a b.com", "", "x.com?q=1"]) {
      await expect(insert(bad)).rejects.toThrow(CHECK);
    }
  });

  it("rejects an unknown signal and a breaker without its signal or instant", async () => {
    const open = { breakerOpenUntil: at(1), breakerOpenedAt: T0 };
    await expect(insert("a.com", { ...open, breakerSignal: "http_500" })).rejects.toThrow(CHECK);
    await expect(insert("b.com", open)).rejects.toThrow(CHECK);
    await expect(insert("c.com", { breakerSignal: "http_429" })).rejects.toThrow(CHECK);
    await insert("d.com", { ...open, breakerSignal: "http_999" });
  });

  it("caps the quota window at 40 entries", async () => {
    await insert("ok.com", { recentRequests: Array.from({ length: 40 }, (_, i) => at(i)) });
    await expect(
      insert("full.com", { recentRequests: Array.from({ length: 41 }, (_, i) => at(i)) }),
    ).rejects.toThrow(CHECK);
  });
});
