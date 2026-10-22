/**
 * T-015 evidence against a real PostgreSQL (Testcontainers; `db-integration` CI job): login/reauth/logout
 * through the HTTP stack with `PrismaSessionService`, synchronized rotation under concurrency, persistent
 * throttling (survives an app restart), absolute/idle expiry and `pnpm setup:user`'s domain function.
 * `TEST_DATABASE_URL` (an empty database) replaces the container for local runs without Docker.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Test } from "@nestjs/testing";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  createFirstOwner,
  createPrismaClient,
  hashSessionSecret,
  LoginThrottle,
  PrismaSessionService,
  SESSION_ABSOLUTE_TTL_MS,
  SESSION_IDLE_TTL_MS,
  SetupUserError,
  THROTTLE_LOCK_MS,
  THROTTLE_MAX_FAILURES,
  validateRuntimeEnv,
  type PrismaClient,
  type RequestMeta,
  type RuntimeEnv,
} from "@linkedin-ops/domain";
import supertest from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";
import { configureApp, createFastifyAdapter } from "../src/app.factory.js";
import { createLogger } from "../src/logging/logger.js";
import { APP_BASE_URL, cookieHeader, LogCapture, mutationHeaders } from "./helpers.js";

/** Same image reference as packages/domain and the CI service (TM-21). */
const POSTGRES_IMAGE =
  "postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24";
const DOMAIN_ROOT = fileURLToPath(new URL("../../../packages/domain", import.meta.url));
const PRISMA_BIN = fileURLToPath(
  new URL("../../../packages/domain/node_modules/.bin/prisma", import.meta.url),
);

const OWNER = {
  email: "Rodrigo@Example.test",
  name: "Rodrigo",
  password: "correct horse battery staple 2026",
};
/** Rounds of the reauth race; the 500 of #105 showed up in a few percent of single rounds in CI. */
const REAUTH_RACE_ROUNDS = 30;
const META: RequestMeta = { ip: "203.0.113.9", userAgent: "vitest", correlationId: "req_test" };

let container: StartedPostgreSqlContainer | undefined;
let databaseUrl: string;
let prisma: PrismaClient;
let env: RuntimeEnv;

interface RunningApp {
  app: NestFastifyApplication;
  request: ReturnType<typeof supertest>;
  logs: LogCapture;
}

async function startApp(): Promise<RunningApp> {
  const logs = new LogCapture();
  const logger = createLogger({ level: "info", pretty: false, stream: logs.stream });
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forRoot({ env, logger })],
  }).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    createFastifyAdapter(logger, env.trustedProxyCidrs),
    { bufferLogs: true, bodyParser: false },
  );
  await configureApp(app, env, logger);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return { app, request: supertest(app.getHttpServer()), logs };
}

function cookieFrom(res: supertest.Response): string {
  const header = (res.headers["set-cookie"] as unknown as string[] | undefined) ?? [];
  const match = header.join(";").match(/__Host-session=([^;]+)/);
  if (!match?.[1]) throw new Error("no session cookie in response");
  return match[1];
}

function login(request: RunningApp["request"], password = OWNER.password) {
  return request
    .post("/api/v1/auth/login")
    .set(mutationHeaders())
    .send({ email: OWNER.email.toLowerCase(), password });
}

beforeAll(async () => {
  databaseUrl = process.env["TEST_DATABASE_URL"] ?? "";
  if (databaseUrl === "") {
    container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
    databaseUrl = container.getConnectionUri();
  }
  execFileSync(PRISMA_BIN, ["migrate", "deploy"], {
    cwd: DOMAIN_ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: ["ignore", "pipe", "pipe"],
  });
  env = validateRuntimeEnv({
    NODE_ENV: "test",
    APP_BASE_URL,
    DATABASE_URL: databaseUrl,
    SESSION_SECRET: randomBytes(48).toString("base64"),
    ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  });
  prisma = createPrismaClient({ connectionString: databaseUrl });
  await createFirstOwner(prisma, OWNER);
});

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

describe("setup:user (createFirstOwner)", () => {
  it("refuses a second OWNER, whatever the e-mail", async () => {
    await expect(
      createFirstOwner(prisma, { ...OWNER, email: "other@example.test" }),
    ).rejects.toBeInstanceOf(SetupUserError);
    expect(await prisma.user.count({ where: { role: "OWNER" } })).toBe(1);
  });

  it("stores the e-mail normalized and only an Argon2id hash of the password", async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { role: "OWNER" } });
    expect(user.email).toBe("rodrigo@example.test");
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain(OWNER.password);
  });
});

describe("HTTP auth flow against PostgreSQL", () => {
  let running: RunningApp;

  beforeAll(async () => {
    running = await startApp();
  });
  afterAll(async () => {
    await running.app.close();
  });
  beforeEach(async () => {
    await prisma.loginThrottle.deleteMany();
  });

  it("login → 200 with cookie + X-CSRF-Token; the database holds only the cookie hash and a minimized IP", async () => {
    const res = await login(running.request).expect(200);
    expect(res.body.elevatedUntil).toBeNull();
    expect(res.headers["x-csrf-token"]).toBe(res.body.csrfToken);
    expect(res.headers["cache-control"]).toBe("no-store");
    const cookie = cookieFrom(res);
    const row = await prisma.session.findUniqueOrThrow({
      where: { secretHash: hashSessionSecret(cookie) },
    });
    expect(row.secretHash).not.toContain(cookie);
    expect(row.ip === null || /\.0$|::$/.test(row.ip)).toBe(true);

    const me = await running.request
      .get("/api/v1/auth/me")
      .set("cookie", cookieHeader(cookie))
      .expect(200);
    expect(me.body).toMatchObject({
      email: "rodrigo@example.test",
      role: "OWNER",
      linkedinConnected: false,
      csrfToken: res.body.csrfToken,
      elevatedUntil: null,
    });
  });

  it("wrong password and unknown e-mail get the same generic 401; the password never reaches the logs", async () => {
    const wrong = await login(running.request, "definitely the wrong password").expect(401);
    const unknown = await running.request
      .post("/api/v1/auth/login")
      .set(mutationHeaders())
      .send({ email: "nobody@example.test", password: OWNER.password })
      .expect(401);
    expect(wrong.body.code).toBe("AUTH_INVALID_CREDENTIALS");
    expect(unknown.body.code).toBe("AUTH_INVALID_CREDENTIALS");
    expect(unknown.body.detail).toBe(wrong.body.detail);
    expect(running.logs.text).not.toContain(OWNER.password);
    expect(running.logs.text).not.toContain("definitely the wrong password");
  });

  it("reauth rotates: new cookie + token, elevated for 15 min; the old cookie stops working at once", async () => {
    const first = await login(running.request).expect(200);
    const oldCookie = cookieFrom(first);
    const before = Date.now();
    const res = await running.request
      .post("/api/v1/auth/reauth")
      .set(mutationHeaders({ cookie: cookieHeader(oldCookie) }))
      .send({ password: OWNER.password })
      .expect(200);
    const newCookie = cookieFrom(res);
    expect(newCookie).not.toBe(oldCookie);
    expect(res.body.csrfToken).not.toBe(first.body.csrfToken);
    expect(res.headers["x-csrf-token"]).toBe(res.body.csrfToken);
    const elevatedFor = Date.parse(res.body.elevatedUntil) - before;
    expect(elevatedFor).toBeGreaterThan(14 * 60 * 1000);
    expect(elevatedFor).toBeLessThanOrEqual(15 * 60 * 1000 + 5_000);

    await running.request.get("/api/v1/auth/me").set("cookie", cookieHeader(oldCookie)).expect(401);
    const me = await running.request
      .get("/api/v1/auth/me")
      .set("cookie", cookieHeader(newCookie))
      .expect(200);
    expect(me.body.elevatedUntil).toBe(res.body.elevatedUntil);
    expect(me.body.csrfToken).toBe(res.body.csrfToken);
  });

  it("two concurrent reauths with the same cookie: exactly one wins", async () => {
    const cookie = cookieFrom(await login(running.request).expect(200));
    const attempt = () =>
      running.request
        .post("/api/v1/auth/reauth")
        .set(mutationHeaders({ cookie: cookieHeader(cookie) }))
        .send({ password: OWNER.password });
    const results = await Promise.all([attempt(), attempt(), attempt()]);
    const statuses = results.map((res) => res.status).sort();
    expect(statuses).toEqual([200, 401, 401]);
  });

  it("concurrent reauths never answer 500, round after round (#105)", async () => {
    // The winner's success clears the throttle rows while the losers are locking them: each round must
    // still be exactly one 200 and the rest 401, never an error.
    for (let round = 0; round < REAUTH_RACE_ROUNDS; round += 1) {
      const cookie = cookieFrom(await login(running.request).expect(200));
      const attempt = () =>
        running.request
          .post("/api/v1/auth/reauth")
          .set(mutationHeaders({ cookie: cookieHeader(cookie) }))
          .send({ password: OWNER.password });
      const results = await Promise.all([attempt(), attempt(), attempt(), attempt()]);
      expect(results.map((res) => res.status).sort(), `round ${round}`).toEqual([
        200, 401, 401, 401,
      ]);
    }
    expect(running.logs.text).not.toContain('"statusCode":500');
  });

  it("logout revokes the session in the database", async () => {
    const cookie = cookieFrom(await login(running.request).expect(200));
    await running.request
      .post("/api/v1/auth/logout")
      .set(mutationHeaders({ cookie: cookieHeader(cookie) }))
      .send({})
      .expect(204);
    await running.request.get("/api/v1/auth/me").set("cookie", cookieHeader(cookie)).expect(401);
    const row = await prisma.session.findUniqueOrThrow({
      where: { secretHash: hashSessionSecret(cookie) },
    });
    expect(row.revokedAt).not.toBeNull();
  });

  it("5 failures in 1 min → 429 with Retry-After ≈ 900 s, even for the right password and after a restart", async () => {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await login(running.request, `wrong password number ${attempt}`).expect(401);
    }
    const locked = await login(running.request).expect(429);
    expect(locked.body.code).toBe("RATE_LIMITED");
    const retryAfter = Number(locked.headers["retry-after"]);
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(890);
    expect(retryAfter).toBeLessThanOrEqual(900);
    expect(locked.headers["set-cookie"]).toBeUndefined();

    const restarted = await startApp();
    try {
      await login(restarted.request).expect(429);
    } finally {
      await restarted.app.close();
    }
  });
});

describe("PrismaSessionService (clock-controlled)", () => {
  let clock: number;
  let service: PrismaSessionService;

  beforeEach(async () => {
    await prisma.loginThrottle.deleteMany();
    clock = Date.now();
    service = new PrismaSessionService({
      prisma,
      sessionSecret: env.sessionSecret,
      now: () => new Date(clock),
    });
  });

  async function freshSession() {
    const outcome = await service.login(OWNER.email, OWNER.password, META);
    if (outcome.kind !== "ok") throw new Error(`login failed: ${outcome.kind}`);
    return outcome.issued;
  }

  it("concurrent rotations of one session: exactly one succeeds and only its cookie resolves", async () => {
    const issued = await freshSession();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => service.rotate(issued.session, META)),
    );
    const winners = results.filter((result) => result !== null);
    expect(winners).toHaveLength(1);
    expect(await service.resolve(issued.cookieValue)).toBeNull();
    const resolved = await service.resolve(winners[0]?.cookieValue);
    expect(resolved?.id).toBe(winners[0]?.session.id);
    expect(resolved?.csrfToken).not.toBe(issued.session.csrfToken);
  });

  it("idle timeout: 7 days without activity ends the session; activity slides it", async () => {
    const idle = await freshSession();
    const active = await freshSession();
    clock += SESSION_IDLE_TTL_MS - 60_000;
    expect(await service.resolve(active.cookieValue)).not.toBeNull();
    clock += 2 * 60_000;
    expect(await service.resolve(idle.cookieValue)).toBeNull();
    expect(await service.resolve(active.cookieValue)).not.toBeNull();
  });

  it("absolute lifetime: 30 days from the first login, across rotations", async () => {
    let issued = await freshSession();
    for (let day = 6; day < 30; day += 6) {
      clock += 6 * 24 * 60 * 60 * 1000;
      const rotated = await service.rotate(issued.session, META);
      expect(rotated).not.toBeNull();
      issued = rotated!;
    }
    clock = issued.session.expiresAt.getTime() - 1_000;
    expect(await service.resolve(issued.cookieValue)).not.toBeNull();
    const row = await prisma.session.findUniqueOrThrow({ where: { id: issued.session.id } });
    expect(row.createdAt.getTime() + SESSION_ABSOLUTE_TTL_MS).toBe(
      issued.session.expiresAt.getTime(),
    );
    clock = row.createdAt.getTime() + SESSION_ABSOLUTE_TTL_MS;
    expect(await service.resolve(issued.cookieValue)).toBeNull();
  });

  it("reauth elevates for exactly 15 minutes and keeps the throttle per user", async () => {
    const issued = await freshSession();
    const outcome = await service.reauth(issued.session, OWNER.password, META);
    expect(outcome.kind).toBe("ok");
    if (outcome.kind !== "ok") return;
    expect(outcome.issued.session.elevatedUntil?.getTime()).toBe(clock + 15 * 60 * 1000);

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      expect((await service.reauth(outcome.issued.session, "nope nope nope nope", META)).kind).toBe(
        "invalid",
      );
    }
    const locked = await service.reauth(outcome.issued.session, OWNER.password, META);
    expect(locked).toEqual({ kind: "rate_limited", retryAfterSeconds: 900 });
  });

  it("the 1-minute window resets: 4 failures, then 61 s later 4 more do not lock", async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await service.login(OWNER.email, "wrong wrong wrong wrong", META);
    }
    clock += 61_000;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await service.login(OWNER.email, "wrong wrong wrong wrong", META);
    }
    expect((await service.login(OWNER.email, OWNER.password, META)).kind).toBe("ok");
  });

  it("a lock ends after 15 minutes", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await service.login(OWNER.email, "wrong wrong wrong wrong", META);
    }
    expect((await service.login(OWNER.email, OWNER.password, META)).kind).toBe("rate_limited");
    clock += 15 * 60 * 1000;
    expect((await service.login(OWNER.email, OWNER.password, META)).kind).toBe("ok");
  });

  it("10 concurrent wrong guesses: exactly 5 reach Argon2id, the other 5 are refused with 429", async () => {
    const outcomes = await Promise.all(
      Array.from({ length: 10 }, () => service.login(OWNER.email, "wrong wrong wrong wrong", META)),
    );
    const kinds = outcomes.map((outcome) => outcome.kind);
    expect(kinds.filter((kind) => kind === "invalid")).toHaveLength(5);
    expect(kinds.filter((kind) => kind === "rate_limited")).toHaveLength(5);
    expect((await service.login(OWNER.email, OWNER.password, META)).kind).toBe("rate_limited");
  });

  it("10 concurrent wrong reauths: exactly 5 reach Argon2id, the other 5 are refused with 429", async () => {
    const issued = await freshSession();
    const outcomes = await Promise.all(
      Array.from({ length: 10 }, () => service.reauth(issued.session, "nope nope nope nope", META)),
    );
    const kinds = outcomes.map((outcome) => outcome.kind);
    expect(kinds.filter((kind) => kind === "invalid")).toHaveLength(5);
    expect(kinds.filter((kind) => kind === "rate_limited")).toHaveLength(5);
    expect((await service.reauth(issued.session, OWNER.password, META)).kind).toBe("rate_limited");
  });
});

/**
 * #90: an attempt is all-or-nothing across its keys. Keys are opaque to `LoginThrottle`, so these use
 * readable stand-ins for the e-mail/reauth and IP keys that `PrismaSessionService` derives.
 */
describe("LoginThrottle (all-or-nothing across keys, clock-controlled)", () => {
  const PRIMARY = "email:issue-90";
  const REAUTH = "reauth:issue-90";
  const IP = "ip:issue-90";
  let clock: number;
  let throttle: LoginThrottle;

  beforeEach(async () => {
    await prisma.loginThrottle.deleteMany();
    clock = Date.now();
    throttle = new LoginThrottle(prisma, () => new Date(clock));
  });

  const row = (key: string) => prisma.loginThrottle.findUnique({ where: { key } });

  async function lock(key: string) {
    for (let attempt = 0; attempt < THROTTLE_MAX_FAILURES; attempt += 1) {
      expect(await throttle.consume([key])).toBeNull();
    }
    expect(await throttle.consume([key])).toBe(THROTTLE_LOCK_MS / 1000);
  }

  async function concurrentPasses(keyOrders: readonly (readonly string[])[]): Promise<number> {
    const results = await Promise.all(keyOrders.map((keys) => throttle.consume(keys)));
    return results.filter((result) => result === null).length;
  }

  it("a refused attempt does not count in its other key (either key locked)", async () => {
    for (const [locked, other] of [
      [PRIMARY, IP],
      [IP, PRIMARY],
    ] as const) {
      await prisma.loginThrottle.deleteMany();
      expect(await throttle.consume([other])).toBeNull();
      const before = await row(other);
      await lock(locked);
      clock += 1_000;
      expect(await throttle.consume([PRIMARY, IP])).toBe(THROTTLE_LOCK_MS / 1000 - 1);
      expect(await row(other)).toEqual(before);
      expect(before?.failures).toBe(1);
    }
  });

  it("a refused attempt does not open the window of its other key", async () => {
    await lock(PRIMARY);
    expect(await throttle.consume([PRIMARY, IP])).not.toBeNull();
    expect((await row(IP))?.failures ?? 0).toBe(0);
    clock += 50_000;
    for (let attempt = 0; attempt < THROTTLE_MAX_FAILURES - 1; attempt += 1) {
      expect(await throttle.consume([IP])).toBeNull();
    }
    clock += 20_000;
    expect(await throttle.consume([IP])).toBeNull();
    expect(await row(IP)).toMatchObject({
      failures: THROTTLE_MAX_FAILURES,
      lockedUntil: new Date(clock + THROTTLE_LOCK_MS),
    });
  });

  it("an accepted attempt counts in every key", async () => {
    expect(await throttle.consume([PRIMARY, IP])).toBeNull();
    expect(await throttle.consume([IP, PRIMARY, IP])).toBeNull();
    expect((await row(PRIMARY))?.failures).toBe(2);
    expect((await row(IP))?.failures).toBe(2);
  });

  it("20 rounds of 10 concurrent attempts: exactly 5 pass each round (login and reauth keys)", async () => {
    for (const primary of [PRIMARY, REAUTH]) {
      const passes: number[] = [];
      for (let round = 0; round < 20; round += 1) {
        await prisma.loginThrottle.deleteMany();
        passes.push(await concurrentPasses(Array.from({ length: 10 }, () => [primary, IP])));
      }
      expect(passes).toEqual(Array.from({ length: 20 }, () => THROTTLE_MAX_FAILURES));
    }
  });

  it("concurrent attempts with keys in opposite orders do not deadlock", async () => {
    for (let round = 0; round < 20; round += 1) {
      await prisma.loginThrottle.deleteMany();
      const orders = Array.from({ length: 10 }, (_, index) =>
        index % 2 === 0 ? [PRIMARY, IP] : [IP, PRIMARY],
      );
      expect(await concurrentPasses(orders)).toBe(THROTTLE_MAX_FAILURES);
    }
  });
});
