/**
 * Career pipeline end to end (career PR 3b, spec 2026-10-22 §5): a batch of three links → `job.fetch` → the real
 * `HttpJobPageFetcher` against a local HTTP server → `job-extract` → `cv.tailor` → `cv-humanize` → `READY`, through
 * the real worker (pg-boss, `registerWorkers`, `wireCareer`) and the real stores (`PrismaJobPostingStore`,
 * `PrismaFetchDomainGuard`) on PostgreSQL. Only the model is fake (`SimulatedLlmClient`). One link answers 404 and
 * fails without stopping the others (spec §9). Logs never carry the URL, the page or the CV (spec §8).
 *
 * Without Docker, point `INTEGRATION_DATABASE_URL` at a server the user may create databases on; this file creates
 * its own database there and drops it afterwards.
 */
import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  CvStructuredSchema,
  JobFetchPayloadSchema,
  PGBOSS_SCHEMA_NAME,
  QUEUES,
} from "@linkedin-ops/contracts";
import {
  createPrismaClient,
  newId,
  PrismaCvBaseDraftStore,
  PrismaCvBases,
  PrismaFetchDomainGuard,
  PrismaJobPostings,
  PrismaJobPostingStore,
  type JobFetchEnqueue,
  type PrismaClient,
} from "@linkedin-ops/domain";
import { CAREER_PROMPTS, SimulatedLlmClient } from "@linkedin-ops/editorial-engine";
import { PgBoss } from "pg-boss";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pgBossCvTailorEnqueue } from "../src/career/enqueue.js";
import { HttpJobPageFetcher, JOB_FETCHER_USER_AGENT } from "../src/career/http-job-page-fetcher.js";
import { wireCareer } from "../src/career/wiring.js";
import { AddressPolicy } from "../src/http/address-policy.js";
import { startWorkerLifecycle, type WorkerLifecycle } from "../src/lifecycle.js";
import { createLogger } from "../src/logger.js";
import { baseCv, jobExtractionOutput, postingText, tailoringOutput } from "./fixtures.js";

const DOMAIN_ROOT = fileURLToPath(new URL("../../../packages/domain", import.meta.url));
const PRISMA_BIN = fileURLToPath(
  new URL("../../../packages/domain/node_modules/.bin/prisma", import.meta.url),
);
const POSTGRES_IMAGE =
  "postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24";

const PAGE_MARKER = "CANARIO-PAGINA-0000";
/** The summary as cv-tailor@1.1.0 asks for it: the work, not a role label. */
const SUMMARY = "Backend engineering for payments over 8 years.";
const TEXTS: Record<string, string> = {
  "seg-1": SUMMARY,
  "seg-2": "Led the migration of the billing service to durable queues.",
  "seg-3": "Evaluated Kafka for event streaming.",
  "seg-4": "TypeScript",
};

let container: StartedPostgreSqlContainer | undefined;
let created: { adminUrl: string; name: string } | undefined;
let prisma: PrismaClient;
let boss: PgBoss;
let lifecycle: WorkerLifecycle;
let server: Server;
let port: number;
let output = "";
const seen: { host: string; url: string; headers: IncomingHttpHeaders }[] = [];
const llm = new SimulatedLlmClient({
  "job-extract": jobExtractionOutput,
  "cv-tailor": () => {
    const output = tailoringOutput();
    const summary = output.tailoredCv.summary.segments[0];
    if (summary) summary.text = SUMMARY;
    return output;
  },
  "cv-humanize": {
    schemaVersion: "1.0",
    injectionSuspected: false,
    injectionEvidence: null,
    segments: Object.entries(TEXTS).map(([segmentId, text]) => ({
      segmentId,
      text,
      changed: false,
      changeReason: null,
    })),
  },
});

function page(): string {
  const body = `${postingText} We build payment platforms with PostgreSQL and event queues. ${PAGE_MARKER}`;
  return `<!doctype html><html><head><title>Senior Backend Engineer</title></head><body><nav>Menu</nav>
<main><h1>Senior Backend Engineer</h1><div class="job-description"><p>${body}</p><p>${body}</p></div></main>
<footer>Footer</footer></body></html>`;
}

async function createDatabase(): Promise<string> {
  const external = process.env.INTEGRATION_DATABASE_URL;
  if (!external) {
    container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
    return container.getConnectionUri();
  }
  const name = `career_pipeline_${Date.now()}`;
  const admin = createPrismaClient({ connectionString: external, maxConnections: 1 });
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.$disconnect();
  }
  created = { adminUrl: external, name };
  const url = new URL(external);
  url.pathname = `/${name}`;
  return url.toString();
}

beforeAll(async () => {
  const databaseUrl = await createDatabase();
  execFileSync(PRISMA_BIN, ["migrate", "deploy"], {
    cwd: DOMAIN_ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: ["ignore", "pipe", "pipe"],
  });
  prisma = createPrismaClient({ connectionString: databaseUrl, maxConnections: 8 });

  server = createServer((req, res) => {
    seen.push({ host: req.headers.host ?? "", url: req.url ?? "", headers: req.headers });
    if (req.url === "/missing") {
      res.writeHead(404, { "content-type": "text/html" });
      res.end("<html><body>Not found</body></html>");
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "set-cookie": "s=canary" });
    res.end(page());
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;

  const logger = createLogger(
    "info",
    new Writable({
      write: (chunk: Buffer, _encoding, callback) => {
        output += chunk.toString("utf8");
        callback();
      },
    }),
  );
  boss = new PgBoss({ connectionString: databaseUrl, schema: PGBOSS_SCHEMA_NAME });
  const real = new AddressPolicy();
  const fetcher = new HttpJobPageFetcher({
    guard: new PrismaFetchDomainGuard(prisma, () => new Date(), { linkedInFetch: "enabled" }),
    httpOptions: {
      // Every host of the test resolves to the local server; nothing else is reachable.
      resolver: () => Promise.resolve([{ address: "127.0.0.1", family: 4 }]),
      addressPolicy: {
        allowsHostname: (host) => real.allowsHostname(host),
        allowsAddress: (address) => address === "127.0.0.1",
      },
      allowedPorts: [port],
    },
  });
  const cvStore = new PrismaCvBaseDraftStore(
    new PrismaCvBases(prisma, (value) => CvStructuredSchema.parse(value)),
  );
  const jobStore = new PrismaJobPostingStore(prisma, pgBossCvTailorEnqueue(boss));
  const career = wireCareer(
    { openai: null, jobFetchLinkedIn: "enabled" },
    logger,
    { cvStore, jobStore, fetcher },
    llm,
  );
  lifecycle = await startWorkerLifecycle({
    boss,
    logger,
    career,
    signals: new EventEmitter() as never,
    heartbeat: () => ({ stop: () => undefined }),
    stopTimeoutMs: 5_000,
  });
});

afterAll(async () => {
  await lifecycle?.stop("afterAll");
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
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

/** What the API's producer does (`PgBossCareerQueue.enqueueFetch`), on the batch's transaction. */
const enqueueFetch: JobFetchEnqueue = async (db, job) => {
  const payload = JobFetchPayloadSchema.parse({
    schemaVersion: 1,
    correlationId: `req_${newId()}`,
    requestedBy: { type: "USER", id: "owner" },
    jobPostingId: job.jobPostingId,
    attempt: job.attempt,
  });
  const id = await boss.send(QUEUES["job.fetch"].name, payload, {
    db,
    singletonKey: QUEUES["job.fetch"].singletonKeyFrom?.(payload),
    group: { id: job.groupId },
  });
  if (id === null) throw new Error("job.fetch was not created");
  return id;
};

describe("career pipeline end to end (batch → READY)", () => {
  it("fetches, extracts and tailors each posting; a failing link does not stop the others", async () => {
    const userId = newId();
    await prisma.user.create({
      data: { id: userId, email: `e2e-${userId}@example.test`, passwordHash: "x", name: "E2E" },
    });
    const now = new Date();
    await prisma.cvBase.create({
      data: {
        id: newId(),
        userId,
        version: 1,
        status: "READY",
        content: baseCv,
        isActive: true,
        confirmedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    });
    const urls = [
      `http://acme.example.com:${port}/job-1?utm_source=newsletter`,
      `http://globex.example.net:${port}/job-2`,
      `http://initech.example.org:${port}/missing`,
    ];
    const batch = await new PrismaJobPostings(prisma).createBatch(
      userId,
      urls,
      { correlationId: "req_e2e", actor: { type: "USER", userId } },
      enqueueFetch,
    );
    const [first, second, failing] = batch.postings.map((posting) => posting.id) as [
      string,
      string,
      string,
    ];

    await expect
      .poll(
        async () =>
          (
            await prisma.jobPosting.findMany({
              where: { batchId: batch.batchId, status: { in: ["FETCHING", "ANALYZING"] } },
            })
          ).length,
        { timeout: 60_000, interval: 250 },
      )
      .toBe(0);

    const rows = await prisma.jobPosting.findMany({ where: { batchId: batch.batchId } });
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get(first)).toMatchObject({ status: "READY", failureReason: null, attempt: 1 });
    expect(byId.get(second)).toMatchObject({ status: "READY", failureReason: null });
    expect(byId.get(failing)).toMatchObject({ status: "FAILED", failureReason: "FETCH" });
    expect(byId.get(first)?.pageText).toContain("5+ years of TypeScript");

    const tailored = await prisma.tailoredCv.findMany({
      where: { jobPostingId: { in: [first, second] } },
    });
    expect(tailored).toHaveLength(2);
    for (const row of tailored) {
      expect(row.generation).toMatchObject({
        promptVersions: { "cv-tailor": CAREER_PROMPTS["cv-tailor"].version },
      });
      expect(JSON.stringify(row.content)).toContain(SUMMARY);
    }

    // The worker is the actor of every step; the posting text and CV content never reach the audit.
    const events = await prisma.auditEvent.findMany({
      where: { entityId: { in: [first, second, failing] }, actorType: "WORKER" },
    });
    expect(events.map((event) => event.action).sort()).toEqual([
      "job_posting.extracted",
      "job_posting.extracted",
      "job_posting.failed",
      "job_posting.tailoring_ready",
      "job_posting.tailoring_ready",
    ]);
    expect(JSON.stringify(events)).not.toContain(PAGE_MARKER);

    // One request per link, anonymous, normalized (no tracking parameter), with the fixed user agent.
    expect(seen.map((request) => request.url).sort()).toEqual(["/job-1", "/job-2", "/missing"]);
    for (const request of seen) {
      expect(request.headers["user-agent"]).toBe(JOB_FETCHER_USER_AGENT);
      expect(request.headers.cookie).toBeUndefined();
    }
    const domains = await prisma.$queryRawUnsafe<{ domain: string }[]>(
      `SELECT "domain" FROM "job_fetch_domain_state" ORDER BY "domain"`,
    );
    expect(domains.map((row) => row.domain)).toEqual(["example.com", "example.net", "example.org"]);

    // Calls per prompt: 2 extractions, 2 tailorings, 2 humanizations (the 404 never reached the model).
    const calls = llm.calls.map((call) => call.promptId).sort();
    expect(calls).toEqual([
      "cv-humanize",
      "cv-humanize",
      "cv-tailor",
      "cv-tailor",
      "job-extract",
      "job-extract",
    ]);

    // Logs: ids, domains and outcomes only (and they were captured: the workers did log).
    expect(output).toContain("career workers registered");
    expect(output).toContain("job page request failed");
    for (const leak of [PAGE_MARKER, "/job-1", "utm_source", "Liderei a migração", "Ana Exemplo"]) {
      expect(output).not.toContain(leak);
    }
  });
});
