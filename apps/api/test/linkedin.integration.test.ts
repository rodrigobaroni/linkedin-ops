/**
 * MVP-0 LinkedIn slice against a real PostgreSQL (T-038/T-052/T-039 núcleo; gates G-02, G-03, G-04):
 * OAuth connect/callback with the N1 atomic state claim, envelope-encrypted token at rest, publish-now with
 * the idempotency claim before the call, AMBIGUOUS on timeout/5xx and reauth on 401/403. LinkedIn is a
 * scripted `fetch` (no network); sessions are real `sessions` rows resolved by `PrismaSessionService`.
 *
 * Without Docker, point `INTEGRATION_DATABASE_URL` at an EMPTY database (e.g. a throwaway local cluster);
 * the container is then skipped.
 */
import "reflect-metadata";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Test } from "@nestjs/testing";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  createPrismaClient,
  deriveCsrfToken,
  hashSessionSecret,
  newId,
  TokenVault,
  validateRuntimeEnv,
  type PrismaClient,
  type RuntimeEnv,
} from "@linkedin-ops/domain";
import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import supertest from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module.js";
import { configureApp, createFastifyAdapter } from "../src/app.factory.js";
import { LINKEDIN_FETCH, type FetchLike } from "../src/linkedin/linkedin.client.js";
import { TOKEN_VAULT } from "../src/linkedin/linkedin-oauth.service.js";
import { LINKEDIN_OIDC_ISSUER } from "../src/linkedin/linkedin.constants.js";
import { ADR_0007_RATE_LIMITS, LINKEDIN_RATE_LIMITS } from "../src/linkedin/rate-limits.js";
import { ABANDONED_CLAIM_MS, PublicationsService } from "../src/linkedin/publications.service.js";
import { createLogger } from "../src/logging/logger.js";
import { APP_BASE_URL, LogCapture, cookieHeader, mutationHeaders } from "./helpers.js";

const POSTGRES_IMAGE =
  "postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24";
const DOMAIN_ROOT = fileURLToPath(new URL("../../../packages/domain", import.meta.url));
const PRISMA_BIN = fileURLToPath(
  new URL("../../../packages/domain/node_modules/.bin/prisma", import.meta.url),
);

const CLIENT_ID = "86integration";
const CLIENT_SECRET = "WPL_AP1.integration-client-secret";
const REDIRECT_URI = `${APP_BASE_URL}/api/v1/auth/linkedin/callback`;
const MEMBER_SUB = "x1Y2z3_member";
const POST_URN = "urn:li:share:7381234567890123456";

type Handler = (url: string, init: RequestInit) => Promise<Response> | Response;

/** Scripted LinkedIn: one handler per endpoint, every call recorded (without needing the network). */
/** LinkedIn's OIDC signing key (test-generated), its JWKS, and the nonce of the last authorize URL. */
const oidc: {
  key?: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];
  jwk?: JWK;
  nonce: string;
} = {
  nonce: "",
};

async function signIdToken(
  claims: { nonce?: string; sub?: string; aud?: string } = {},
): Promise<string> {
  return new SignJWT({ nonce: claims.nonce ?? oidc.nonce })
    .setProtectedHeader({ alg: "RS256", kid: "li-test" })
    .setSubject(claims.sub ?? MEMBER_SUB)
    .setIssuer(LINKEDIN_OIDC_ISSUER)
    .setAudience(claims.aud ?? CLIENT_ID)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(oidc.key!);
}

async function tokenResponse(extra: Record<string, unknown> = {}): Promise<Response> {
  return json(200, {
    access_token: `AQV-${randomUUID()}`,
    expires_in: 5_183_999,
    scope: "openid,profile,w_member_social",
    id_token: await signIdToken(),
    ...extra,
  });
}

class FakeLinkedIn {
  calls: { url: string; init: RequestInit }[] = [];
  token: Handler = () => tokenResponse();
  userinfo: Handler = () =>
    json(200, { sub: MEMBER_SUB, name: "Rodrigo Baroni", given_name: "Rodrigo" });
  posts: Handler = () => new Response(null, { status: 201, headers: { "x-restli-id": POST_URN } });

  readonly fetch: FetchLike = async (url, init) => {
    this.calls.push({ url, init });
    if (url === "https://www.linkedin.com/oauth/v2/accessToken") return this.token(url, init);
    if (url === "https://api.linkedin.com/v2/userinfo") return this.userinfo(url, init);
    if (url === "https://api.linkedin.com/rest/posts") return this.posts(url, init);
    if (url === "https://www.linkedin.com/oauth/openid/jwks")
      return json(200, { keys: [oidc.jwk] });
    throw new Error(`unexpected LinkedIn call ${url}`);
  };

  callsTo(suffix: string) {
    return this.calls.filter((call) => call.url.endsWith(suffix));
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let container: StartedPostgreSqlContainer | undefined;
let prisma: PrismaClient;
let app: NestFastifyApplication;
let request: ReturnType<typeof supertest>;
let env: RuntimeEnv;
let vault: TokenVault;
const linkedin = new FakeLinkedIn();
const logs = new LogCapture();

interface Actor {
  userId: string;
  sessionId: string;
  cookie: string;
  csrfToken: string;
}

/** A fresh user + elevated session per test: rate limits and per-user state never leak between tests. */
async function newActor(options: { elevated?: boolean } = {}): Promise<Actor> {
  const userId = newId();
  const sessionId = newId();
  await prisma.user.create({
    data: {
      id: userId,
      email: `owner-${userId}@example.test`,
      passwordHash: "not-a-login",
      name: "Owner",
    },
  });
  // A real `sessions` row, resolved by the app's own PrismaSessionService (T-015): only the cookie's
  // SHA-256 is stored and the CSRF token is derived from the session id, exactly as at login.
  const cookie = randomBytes(32).toString("base64url");
  await prisma.session.create({
    data: {
      id: sessionId,
      userId,
      secretHash: hashSessionSecret(cookie),
      expiresAt: new Date(Date.now() + 3_600_000),
      elevatedUntil: options.elevated === false ? null : new Date(Date.now() + 15 * 60_000),
    },
  });
  return { userId, sessionId, cookie, csrfToken: deriveCsrfToken(env.sessionSecret, sessionId) };
}

function elevated(actor: Actor, extra: Record<string, string> = {}) {
  return mutationHeaders({
    cookie: cookieHeader(actor.cookie),
    "x-csrf-token": actor.csrfToken,
    ...extra,
  });
}

async function connectUrl(actor: Actor): Promise<URL> {
  const res = await request
    .post("/api/v1/integrations/linkedin/connect")
    .set(elevated(actor))
    .send({});
  expect(res.status).toBe(200);
  const url = new URL(res.body.authorizeUrl as string);
  oidc.nonce = url.searchParams.get("nonce") ?? "";
  return url;
}

function callback(actor: Actor | null, query: Record<string, string>) {
  const req = request.get("/api/v1/auth/linkedin/callback").query(query);
  return actor ? req.set("cookie", cookieHeader(actor.cookie)) : req;
}

/** New `__Host-session` cookie value and `X-CSRF-Token` set by a rotating response. */
function rotatedSessionOf(res: { headers: Record<string, unknown> }): {
  cookie: string;
  csrfToken: string;
} {
  const setCookie = ([] as string[]).concat(
    (res.headers["set-cookie"] as string[] | undefined) ?? [],
  );
  const session = setCookie.find((line) => line.startsWith("__Host-session="));
  expect(session, "rotated session cookie").toBeDefined();
  expect(session).toMatch(/HttpOnly/i);
  expect(session).toMatch(/Secure/i);
  expect(session).toMatch(/SameSite=Lax/i);
  expect(session).toMatch(/Path=\//);
  const csrfToken = res.headers["x-csrf-token"];
  expect(typeof csrfToken).toBe("string");
  return {
    cookie: session!.split(";")[0]!.slice("__Host-session=".length),
    csrfToken: csrfToken as string,
  };
}

function resultOf(res: { status: number; headers: Record<string, string> }): string | null {
  expect(res.status).toBe(302);
  const location = new URL(res.headers.location ?? "");
  expect(location.origin + location.pathname).toBe(`${APP_BASE_URL}/publicar`);
  // `?linkedin=connected`, or `?linkedin=error&reason=<reason>`: the reason is returned for errors.
  if (location.searchParams.get("linkedin") === "connected") {
    expect([...location.searchParams.keys()]).toEqual(["linkedin"]);
    return "connected";
  }
  expect([...location.searchParams.keys()]).toEqual(["linkedin", "reason"]);
  expect(location.searchParams.get("linkedin")).toBe("error");
  return location.searchParams.get("reason");
}

/** Stores an ACTIVE credential directly (publish tests do not need to replay the OAuth dance). */
async function seedToken(
  actor: Actor,
  overrides: { accessExpiresAt?: Date; scopes?: string[] } = {},
) {
  const id = newId();
  const sealed = vault.seal(
    { provider: "linkedin", userId: actor.userId, credentialId: id },
    { accessToken: "AQV-seeded" },
  );
  await prisma.oAuthToken.create({
    data: {
      id,
      userId: actor.userId,
      providerSubject: MEMBER_SUB,
      memberName: "Rodrigo Baroni",
      accessTokenCiphertext: new Uint8Array(sealed.accessTokenCiphertext),
      wrappedDek: new Uint8Array(sealed.wrappedDek),
      keyVersion: sealed.keyVersion,
      scopes: overrides.scopes ?? ["openid", "profile", "w_member_social"],
      accessExpiresAt: overrides.accessExpiresAt ?? new Date(Date.now() + 86_400_000),
    },
  });
  return id;
}

function publish(actor: Actor, text: string, key: string | null = randomUUID()) {
  const headers = elevated(actor, key === null ? {} : { "idempotency-key": key });
  return request.post("/api/v1/publications/publish-now").set(headers).send({ text });
}

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  oidc.key = pair.privateKey;
  oidc.jwk = { ...(await exportJWK(pair.publicKey)), kid: "li-test", alg: "RS256", use: "sig" };
  let databaseUrl = process.env.INTEGRATION_DATABASE_URL;
  if (!databaseUrl) {
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
    LINKEDIN_CLIENT_ID: CLIENT_ID,
    LINKEDIN_CLIENT_SECRET: CLIENT_SECRET,
    LINKEDIN_REDIRECT_URI: REDIRECT_URI,
    LINKEDIN_PKCE: "disabled",
  });
  vault = new TokenVault(env.encryptionKeyRing);
  prisma = createPrismaClient({ connectionString: databaseUrl });
  const logger = createLogger({ level: "info", pretty: false, stream: logs.stream });
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forRoot({ env, logger })],
  })
    .overrideProvider(LINKEDIN_FETCH)
    .useValue(linkedin.fetch)
    // Every callback of this file comes from 127.0.0.1; the ADR ceilings are pinned in rate-limits.test.ts.
    .overrideProvider(LINKEDIN_RATE_LIMITS)
    .useValue({ ...ADR_0007_RATE_LIMITS, callbackPerIp: 1000 })
    .compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter(logger), {
    bufferLogs: true,
    bodyParser: false,
  });
  await configureApp(app, env, logger);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  request = supertest(app.getHttpServer());
});

afterAll(async () => {
  await app?.close();
  await prisma?.$disconnect();
  await container?.stop();
});

beforeEach(() => {
  linkedin.calls = [];
  linkedin.token = new FakeLinkedIn().token;
  linkedin.userinfo = new FakeLinkedIn().userinfo;
  linkedin.posts = new FakeLinkedIn().posts;
});

describe("POST /integrations/linkedin/connect", () => {
  it("returns the authorize URL with the exact scopes, the fixed redirect and no PKCE; stores only a hash", async () => {
    const actor = await newActor();
    const url = await connectUrl(actor);
    expect(url.origin + url.pathname).toBe("https://www.linkedin.com/oauth/v2/authorization");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("86integration");
    expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT_URI);
    expect(url.searchParams.get("scope")).toBe("openid profile w_member_social");
    expect(url.searchParams.has("code_challenge")).toBe(false);
    const state = url.searchParams.get("state") ?? "";
    expect(Buffer.from(state, "base64url")).toHaveLength(32);

    const rows = await prisma.oAuthState.findMany({ where: { sessionId: actor.sessionId } });
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(state);
    // OIDC nonce: CSPRNG, sent in the URL, only its SHA-256 persisted with the state.
    const nonce = url.searchParams.get("nonce") ?? "";
    expect(Buffer.from(nonce, "base64url")).toHaveLength(32);
    expect(JSON.stringify(rows)).not.toContain(nonce);
    expect(rows[0]!.nonceHash).toBe(createHash("sha256").update(nonce).digest("hex"));
    const ttl = rows[0]!.expiresAt.getTime() - rows[0]!.createdAt.getTime();
    expect(ttl).toBeGreaterThan(9 * 60_000);
    expect(ttl).toBeLessThanOrEqual(10 * 60_000 + 1000);
  });

  it("requires a recent re-authentication and the CSRF token (🔐)", async () => {
    const actor = await newActor({ elevated: false });
    const res = await request
      .post("/api/v1/integrations/linkedin/connect")
      .set(elevated(actor))
      .send({});
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("AUTH_REAUTH_REQUIRED");
    const other = await newActor();
    const noCsrf = await request
      .post("/api/v1/integrations/linkedin/connect")
      .set(mutationHeaders({ cookie: cookieHeader(other.cookie) }))
      .send({});
    expect(noCsrf.body.code).toBe("CSRF_REJECTED");
  });

  it("a new connect invalidates the previous state of the session", async () => {
    const actor = await newActor();
    const first = (await connectUrl(actor)).searchParams.get("state")!;
    await connectUrl(actor);
    const res = await callback(actor, { code: "c", state: first });
    expect(resultOf(res)).toBe("invalid_state");
    expect(linkedin.calls).toHaveLength(0);
  });
});

describe("GET /auth/linkedin/callback (N1, G-03)", () => {
  it("happy path: exchanges once, stores the token encrypted, records audit, redirects to /publicar", async () => {
    const actor = await newActor();
    const state = (await connectUrl(actor)).searchParams.get("state")!;
    let issued = "";
    linkedin.token = () => {
      issued = `AQV-${randomUUID()}`;
      return tokenResponse({ access_token: issued });
    };
    const res = await callback(actor, { code: "auth-code-123", state });
    expect(resultOf(res)).toBe("connected");
    expect(res.headers["cache-control"]).toBe("no-store");
    // A-3: the session was rotated; the redirect carries the new cookie and CSRF token.
    const rotated = rotatedSessionOf(res);
    expect(rotated.cookie).not.toBe(actor.cookie);
    const successor = await prisma.session.findUniqueOrThrow({
      where: { secretHash: hashSessionSecret(rotated.cookie) },
    });
    expect(successor.id).not.toBe(actor.sessionId);
    expect(successor.userId).toBe(actor.userId);
    expect(rotated.csrfToken).toBe(deriveCsrfToken(env.sessionSecret, successor.id));
    expect(rotated.csrfToken).not.toBe(actor.csrfToken);
    expect(linkedin.callsTo("/accessToken")).toHaveLength(1);
    expect(linkedin.callsTo("/userinfo")).toHaveLength(1);

    const token = await prisma.oAuthToken.findUniqueOrThrow({
      where: { userId_provider: { userId: actor.userId, provider: "LINKEDIN" } },
    });
    // G-02: never in clear at rest; decrypts only through the vault bound to this row.
    const raw = Buffer.concat([
      Buffer.from(token.accessTokenCiphertext),
      Buffer.from(token.wrappedDek),
    ]);
    expect(raw.includes(Buffer.from(issued))).toBe(false);
    expect(token.keyVersion).toBe("1");
    await expect(
      vault.withAccessToken(
        { provider: "linkedin", userId: actor.userId, credentialId: token.id },
        token,
        async (plain) => plain,
      ),
    ).resolves.toBe(issued);
    expect(token).toMatchObject({
      providerSubject: MEMBER_SUB,
      memberName: "Rodrigo Baroni",
      status: "ACTIVE",
    });
    expect(await prisma.oAuthState.count({ where: { sessionId: actor.sessionId } })).toBe(0);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
    expect(user.linkedinMemberUrn).toBe(`urn:li:person:${MEMBER_SUB}`);
    const audit = await prisma.auditEvent.findMany({ where: { userId: actor.userId } });
    expect(audit.map((event) => event.action).sort()).toEqual([
      "auth.session.rotate",
      "integration.linkedin.connect",
    ]);

    // The old session is dead; only the rotated one works.
    await request
      .get("/api/v1/integrations/linkedin")
      .set("cookie", cookieHeader(actor.cookie))
      .expect(401);
    const status = await request
      .get("/api/v1/integrations/linkedin")
      .set("cookie", cookieHeader(rotated.cookie))
      .expect(200);
    expect(status.body).toEqual({
      status: "ACTIVE",
      scopes: ["openid", "profile", "w_member_social"],
      accessExpiresAt: token.accessExpiresAt.toISOString(),
      memberUrn: `urn:li:person:${MEMBER_SUB}`,
      memberName: "Rodrigo Baroni",
    });
    expect(JSON.stringify(status.body)).not.toContain(issued);
    // Nothing secret reaches the logs: token, code, state, client secret.
    for (const secret of [issued, "auth-code-123", state, CLIENT_SECRET]) {
      expect(logs.text).not.toContain(secret);
    }
  });

  it("loses a session rotation race fail-closed: nothing stored, no new cookie (A-3)", async () => {
    const actor = await newActor();
    const state = (await connectUrl(actor)).searchParams.get("state")!;
    // Another request rotates/revokes the session while this callback is talking to LinkedIn.
    linkedin.userinfo = async () => {
      await prisma.session.update({
        where: { id: actor.sessionId },
        data: { revokedAt: new Date() },
      });
      return json(200, { sub: MEMBER_SUB, name: "Rodrigo Baroni" });
    };
    const res = await callback(actor, { code: "c", state });
    expect(resultOf(res)).toBe("invalid_state");
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(res.headers["x-csrf-token"]).toBeUndefined();
    expect(await prisma.oAuthToken.count({ where: { userId: actor.userId } })).toBe(0);
    expect(await prisma.session.count({ where: { userId: actor.userId, revokedAt: null } })).toBe(
      0,
    );
  });

  it("a replayed state is rejected without calling LinkedIn again", async () => {
    const actor = await newActor();
    const state = (await connectUrl(actor)).searchParams.get("state")!;
    expect(resultOf(await callback(actor, { code: "c1", state }))).toBe("connected");
    expect(resultOf(await callback(actor, { code: "c2", state }))).toBe("invalid_state");
    expect(linkedin.callsTo("/accessToken")).toHaveLength(1);
  });

  it("two concurrent callbacks with the same state yield exactly one token exchange", async () => {
    const actor = await newActor();
    const state = (await connectUrl(actor)).searchParams.get("state")!;
    const results = await Promise.all([
      callback(actor, { code: "c1", state }),
      callback(actor, { code: "c2", state }),
    ]);
    expect(results.map(resultOf).sort()).toEqual(["connected", "invalid_state"]);
    expect(linkedin.callsTo("/accessToken")).toHaveLength(1);
  });

  it("an error callback consumes the state (no later code can use it)", async () => {
    const actor = await newActor();
    const state = (await connectUrl(actor)).searchParams.get("state")!;
    const denied = await callback(actor, {
      error: "user_cancelled_authorize",
      error_description: "The member declined",
      state,
    });
    expect(resultOf(denied)).toBe("denied");
    expect(resultOf(await callback(actor, { code: "c", state }))).toBe("invalid_state");
    expect(linkedin.calls).toHaveLength(0);
  });

  it("an expired state is rejected without calling LinkedIn", async () => {
    const actor = await newActor();
    const state = (await connectUrl(actor)).searchParams.get("state")!;
    await prisma.oAuthState.updateMany({
      where: { sessionId: actor.sessionId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(resultOf(await callback(actor, { code: "c", state }))).toBe("expired");
    expect(linkedin.calls).toHaveLength(0);
  });

  it("a callback from another session, or without a session, is rejected and does NOT consume the owner's state (A-1)", async () => {
    const owner = await newActor();
    const attacker = await newActor();
    const state = (await connectUrl(owner)).searchParams.get("state")!;
    expect(resultOf(await callback(attacker, { code: "c", state }))).toBe("invalid_state");
    expect(resultOf(await callback(attacker, { error: "user_cancelled_authorize", state }))).toBe(
      "invalid_state",
    );
    expect(resultOf(await callback(null, { code: "c", state }))).toBe("invalid_state");
    expect(linkedin.calls).toHaveLength(0);
    const row = await prisma.oAuthState.findFirstOrThrow({ where: { sessionId: owner.sessionId } });
    expect(row.usedAt).toBeNull();
    // The owner's session can still complete the flow with it.
    expect(resultOf(await callback(owner, { code: "c", state }))).toBe("connected");
    expect(await prisma.oAuthToken.count({ where: { userId: attacker.userId } })).toBe(0);
  });

  it("a token response without id_token stores nothing (exchange_failed)", async () => {
    const actor = await newActor();
    const state = (await connectUrl(actor)).searchParams.get("state")!;
    linkedin.token = () => tokenResponse({ id_token: undefined });
    expect(resultOf(await callback(actor, { code: "c", state }))).toBe("exchange_failed");
    expect(await prisma.oAuthToken.count({ where: { userId: actor.userId } })).toBe(0);
  });

  it.each([
    ["a nonce from another flow", { nonce: "replayed-nonce" }],
    ["a sub different from userinfo", { sub: "someone-else" }],
    ["another audience", { aud: "another-client" }],
  ])("an id_token with %s stores nothing (exchange_failed)", async (_name, claims) => {
    const actor = await newActor();
    const state = (await connectUrl(actor)).searchParams.get("state")!;
    linkedin.token = async () => tokenResponse({ id_token: await signIdToken(claims) });
    expect(resultOf(await callback(actor, { code: "c", state }))).toBe("exchange_failed");
    expect(await prisma.oAuthToken.count({ where: { userId: actor.userId } })).toBe(0);
    expect(await prisma.auditEvent.count({ where: { userId: actor.userId } })).toBe(0);
  });

  it("a grant without w_member_social is not stored", async () => {
    const actor = await newActor();
    const state = (await connectUrl(actor)).searchParams.get("state")!;
    linkedin.token = () => tokenResponse({ scope: "openid,profile" });
    expect(resultOf(await callback(actor, { code: "c", state }))).toBe("scope_missing");
    expect(await prisma.oAuthToken.count({ where: { userId: actor.userId } })).toBe(0);
  });

  it("a failed token exchange redirects with error and stores nothing", async () => {
    const actor = await newActor();
    const state = (await connectUrl(actor)).searchParams.get("state")!;
    linkedin.token = () => json(400, { error: "invalid_grant", error_description: "bad code" });
    expect(resultOf(await callback(actor, { code: "c", state }))).toBe("exchange_failed");
    expect(await prisma.oAuthToken.count({ where: { userId: actor.userId } })).toBe(0);
  });

  it("rejects a query with both code and error, or unknown params (400, no claim)", async () => {
    const actor = await newActor();
    await callback(actor, { code: "c", error: "e", state: "s" }).expect(400);
    await callback(actor, { code: "c", state: "s", extra: "1" }).expect(400);
  });
});

describe("DELETE /integrations/linkedin", () => {
  it("removes the credential, clears the member URN and audits; then GET says DISCONNECTED", async () => {
    const actor = await newActor();
    await seedToken(actor);
    await request.delete("/api/v1/integrations/linkedin").set(elevated(actor)).send({}).expect(204);
    expect(await prisma.oAuthToken.count({ where: { userId: actor.userId } })).toBe(0);
    const audit = await prisma.auditEvent.findMany({ where: { userId: actor.userId } });
    expect(audit.map((event) => event.action)).toEqual(["integration.linkedin.disconnect"]);
    const status = await request
      .get("/api/v1/integrations/linkedin")
      .set("cookie", cookieHeader(actor.cookie));
    expect(status.body).toEqual({
      status: "DISCONNECTED",
      scopes: [],
      accessExpiresAt: null,
      memberUrn: null,
      memberName: null,
    });
  });
});

describe("POST /publications/publish-now (G-04)", () => {
  it("publishes once with the pinned headers and returns SUCCEEDED with the post URN", async () => {
    const actor = await newActor();
    await seedToken(actor);
    const text = "Primeiro post pelo LinkedIn Ops (teste) #mvp";
    const res = await publish(actor, text);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: "SUCCEEDED",
      draftId: null,
      draftVersionId: null,
      text,
      attempt: 1,
      externalPostId: POST_URN,
      externalUrl: `https://www.linkedin.com/feed/update/${POST_URN}/`,
      error: null,
    });
    expect(res.body.publishedAt).toEqual(expect.any(String));
    const [call] = linkedin.callsTo("/rest/posts");
    const headers = call!.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer AQV-seeded");
    expect(headers["x-restli-protocol-version"]).toBe("2.0.0");
    const body = JSON.parse(String(call!.init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      author: `urn:li:person:${MEMBER_SUB}`,
      commentary: "Primeiro post pelo LinkedIn Ops \\(teste\\) \\#mvp",
      visibility: "PUBLIC",
      lifecycleState: "PUBLISHED",
    });
    const row = await prisma.publication.findUniqueOrThrow({
      where: { id: res.body.id as string },
    });
    expect(row.requestFingerprint).toBe(
      createHash("sha256").update(String(call!.init.body)).digest("hex"),
    );
    expect(row.idempotencyKey).toMatch(new RegExp(`^pub:manual:${actor.userId}:`));
    const audit = await prisma.auditEvent.findMany({ where: { userId: actor.userId } });
    expect(audit.map((event) => event.action)).toEqual(["publication.succeeded"]);
    expect(logs.text).not.toContain("AQV-seeded");
  });

  it("double click: the same Idempotency-Key, sequential or concurrent, calls LinkedIn exactly once", async () => {
    const actor = await newActor();
    await seedToken(actor);
    const key = randomUUID();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    linkedin.posts = async () => {
      await gate;
      return new Response(null, { status: 201, headers: { "x-restli-id": POST_URN } });
    };
    const concurrent = Promise.all([publish(actor, "Olá", key), publish(actor, "Olá", key)]);
    await new Promise((resolve) => setTimeout(resolve, 300));
    release();
    const [a, b] = await concurrent;
    const replay = await publish(actor, "Olá", key);
    expect([a.status, b.status, replay.status]).toEqual([201, 201, 201]);
    expect(new Set([a.body.id, b.body.id, replay.body.id]).size).toBe(1);
    expect(replay.body.status).toBe("SUCCEEDED");
    expect(linkedin.callsTo("/rest/posts")).toHaveLength(1);
    expect(await prisma.publication.count({ where: { userId: actor.userId } })).toBe(1);
  });

  it("the same key with another text is a 409 conflict; a missing key is 400", async () => {
    const actor = await newActor();
    await seedToken(actor);
    const key = randomUUID();
    await publish(actor, "Texto A", key).expect(201);
    const conflict = await publish(actor, "Texto B", key);
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe("IDEMPOTENCY_KEY_CONFLICT");
    const missing = await publish(actor, "Texto C", null);
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    expect(linkedin.callsTo("/rest/posts")).toHaveLength(1);
  });

  it("a timeout after sending is AMBIGUOUS, never retried; a new key for the same text is refused", async () => {
    const actor = await newActor();
    await seedToken(actor);
    linkedin.posts = () => {
      const error = new Error("The operation was aborted due to timeout");
      error.name = "TimeoutError";
      throw error;
    };
    const key = randomUUID();
    const res = await publish(actor, "Post incerto", key);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: "AMBIGUOUS",
      externalPostId: null,
      error: { code: "TIMEOUT", httpStatus: null },
    });
    expect((await publish(actor, "Post incerto", key)).body.status).toBe("AMBIGUOUS");
    const again = await publish(actor, "Post incerto", randomUUID());
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("PUBLICATION_ALREADY_EXISTS");
    expect(linkedin.callsTo("/rest/posts")).toHaveLength(1);
  });

  it("a 5xx from LinkedIn is AMBIGUOUS", async () => {
    const actor = await newActor();
    await seedToken(actor);
    linkedin.posts = () => json(503, { message: "upstream" });
    const res = await publish(actor, "Post com 503");
    expect(res.body).toMatchObject({
      status: "AMBIGUOUS",
      error: { code: "LINKEDIN_SERVER_ERROR", httpStatus: 503 },
    });
  });

  it.each([
    [401, "LINKEDIN_UNAUTHORIZED"],
    [403, "LINKEDIN_FORBIDDEN"],
  ])(
    "a %i from LinkedIn is FAILED and the connection becomes REAUTH_REQUIRED",
    async (httpStatus, code) => {
      const actor = await newActor();
      await seedToken(actor);
      linkedin.posts = () => json(httpStatus, { message: "nope" });
      const res = await publish(actor, `Post ${httpStatus}`);
      expect(res.body).toMatchObject({ status: "FAILED", error: { code, httpStatus } });
      const status = await request
        .get("/api/v1/integrations/linkedin")
        .set("cookie", cookieHeader(actor.cookie));
      expect(status.body.status).toBe("REAUTH_REQUIRED");
      const next = await publish(actor, "Outro post");
      expect(next.status).toBe(412);
      expect(next.body.code).toBe("LINKEDIN_REAUTH_REQUIRED");
      expect(linkedin.callsTo("/rest/posts")).toHaveLength(1);
    },
  );

  it("a 429 from LinkedIn is FAILED (fail closed) and keeps the connection", async () => {
    const actor = await newActor();
    await seedToken(actor);
    linkedin.posts = () => json(429, { message: "throttled" });
    const res = await publish(actor, "Post 429");
    expect(res.body).toMatchObject({
      status: "FAILED",
      error: { code: "LINKEDIN_RATE_LIMITED", httpStatus: 429 },
    });
    const status = await request
      .get("/api/v1/integrations/linkedin")
      .set("cookie", cookieHeader(actor.cookie));
    expect(status.body.status).toBe("ACTIVE");
  });

  it("refuses without a connection, with an expired token or without w_member_social (412, nothing sent)", async () => {
    const none = await newActor();
    expect((await publish(none, "x")).body.code).toBe("LINKEDIN_REAUTH_REQUIRED");
    const expired = await newActor();
    await seedToken(expired, { accessExpiresAt: new Date(Date.now() - 1000) });
    expect((await publish(expired, "x")).status).toBe(412);
    const status = await request
      .get("/api/v1/integrations/linkedin")
      .set("cookie", cookieHeader(expired.cookie));
    expect(status.body.status).toBe("EXPIRED");
    const noScope = await newActor();
    await seedToken(noScope, { scopes: ["openid", "profile"] });
    expect((await publish(noScope, "x")).status).toBe(412);
    expect(linkedin.calls).toHaveLength(0);
    expect(
      await prisma.publication.count({
        where: { userId: { in: [none.userId, expired.userId, noScope.userId] } },
      }),
    ).toBe(0);
  });

  it("a tampered ciphertext fails closed: FAILED before any call, connection needs reauth", async () => {
    const actor = await newActor();
    const id = await seedToken(actor);
    const token = await prisma.oAuthToken.findUniqueOrThrow({ where: { id } });
    const tampered = Buffer.from(token.accessTokenCiphertext);
    tampered.writeUInt8(tampered.readUInt8(tampered.length - 1) ^ 0x01, tampered.length - 1);
    await prisma.oAuthToken.update({
      where: { id },
      data: { accessTokenCiphertext: new Uint8Array(tampered) },
    });
    const res = await publish(actor, "Post com token adulterado");
    expect(res.body).toMatchObject({ status: "FAILED", error: { code: "TOKEN_DECRYPT_FAILED" } });
    expect(linkedin.calls).toHaveLength(0);
  });

  it("requires elevation + CSRF and validates the text (1..3000, not blank)", async () => {
    const actor = await newActor({ elevated: false });
    await seedToken(actor);
    expect((await publish(actor, "x")).body.code).toBe("AUTH_REAUTH_REQUIRED");
    const ok = await newActor();
    await seedToken(ok);
    expect((await publish(ok, "   ")).status).toBe(400);
    expect((await publish(ok, "a".repeat(3001))).status).toBe(400);
    const noCsrf = await request
      .post("/api/v1/publications/publish-now")
      .set(mutationHeaders({ cookie: cookieHeader(ok.cookie), "idempotency-key": randomUUID() }))
      .send({ text: "x" });
    expect(noCsrf.body.code).toBe("CSRF_REJECTED");
    expect(linkedin.calls).toHaveLength(0);
  });

  it("rate limits new publications per user (429 with Retry-After); replays are not counted", async () => {
    const actor = await newActor();
    await seedToken(actor);
    const key = randomUUID();
    for (let index = 0; index < ADR_0007_RATE_LIMITS.publishPerUser; index += 1) {
      await publish(actor, `Post ${index}`, index === 0 ? key : randomUUID()).expect(201);
    }
    await publish(actor, "Post 0", key).expect(201);
    const limited = await publish(actor, "Post 4");
    expect(limited.status).toBe(429);
    expect(limited.headers["retry-after"]).toMatch(/^\d+$/);
  });
});

describe("abandoned publish-now claims (crash between claim and result)", () => {
  afterEach(() => vi.restoreAllMocks());

  /** Moves the claim back in time, as if the process died that long ago. */
  async function age(publicationId: string) {
    await prisma.publication.update({
      where: { id: publicationId },
      data: { startedAt: new Date(Date.now() - ABANDONED_CLAIM_MS - 1000) },
    });
  }

  async function expectSettledAmbiguous(actor: Actor, text: string, key: string) {
    const row = await prisma.publication.findFirstOrThrow({ where: { userId: actor.userId } });
    expect(row.status).toBe("IN_PROGRESS");
    const fresh = await publish(actor, text, key);
    expect(fresh.body.status).toBe("IN_PROGRESS"); // still young: a double click in flight, not a crash
    await age(row.id);
    const replay = await publish(actor, text, key);
    expect(replay.status).toBe(201);
    expect(replay.body).toMatchObject({
      id: row.id,
      status: "AMBIGUOUS",
      error: { code: "CLAIM_ABANDONED", httpStatus: null },
    });
    const cookie = cookieHeader(actor.cookie);
    const one = await request
      .get(`/api/v1/publications/${row.id}`)
      .set("cookie", cookie)
      .expect(200);
    expect(one.body.status).toBe("AMBIGUOUS");
    const again = await publish(actor, text, randomUUID());
    expect(again.body.code).toBe("PUBLICATION_ALREADY_EXISTS");
    const audit = await prisma.auditEvent.findMany({
      where: { entityId: row.id, action: "publication.ambiguous" },
    });
    expect(audit).toHaveLength(1);
  }

  it("crash BEFORE the effect: replay settles AMBIGUOUS and never sends", async () => {
    const actor = await newActor();
    await seedToken(actor);
    const vault = app.get<TokenVault>(TOKEN_VAULT);
    vi.spyOn(vault, "withAccessToken").mockRejectedValueOnce(new Error("process died"));
    const key = randomUUID();
    expect((await publish(actor, "Crash antes", key)).status).toBe(500);
    await expectSettledAmbiguous(actor, "Crash antes", key);
    expect(linkedin.callsTo("/rest/posts")).toHaveLength(0);
  });

  it("crash AFTER the effect: the post exists, replay settles AMBIGUOUS and never re-sends", async () => {
    const actor = await newActor();
    await seedToken(actor);
    const service = app.get(PublicationsService) as unknown as { finish: () => Promise<unknown> };
    vi.spyOn(service, "finish").mockRejectedValueOnce(new Error("process died"));
    const key = randomUUID();
    expect((await publish(actor, "Crash depois", key)).status).toBe(500);
    expect(linkedin.callsTo("/rest/posts")).toHaveLength(1);
    await expectSettledAmbiguous(actor, "Crash depois", key);
    expect(linkedin.callsTo("/rest/posts")).toHaveLength(1);
  });

  it("the history settles abandoned claims too", async () => {
    const actor = await newActor();
    await seedToken(actor);
    const vault = app.get<TokenVault>(TOKEN_VAULT);
    vi.spyOn(vault, "withAccessToken").mockRejectedValueOnce(new Error("process died"));
    await publish(actor, "Crash lista").expect(500);
    const row = await prisma.publication.findFirstOrThrow({ where: { userId: actor.userId } });
    await age(row.id);
    const list = await request
      .get("/api/v1/publications")
      .set("cookie", cookieHeader(actor.cookie))
      .expect(200);
    expect(list.body.items[0]).toMatchObject({ id: row.id, status: "AMBIGUOUS" });
  });
});

describe("GET /publications", () => {
  it("lists the user's publications, newest first, with a cursor; other users' are invisible", async () => {
    const actor = await newActor();
    const stranger = await newActor();
    await seedToken(actor);
    await seedToken(stranger);
    for (const text of ["um", "dois", "três"]) await publish(actor, text).expect(201);
    await publish(stranger, "alheio").expect(201);
    const cookie = cookieHeader(actor.cookie);
    const first = await request
      .get("/api/v1/publications")
      .query({ limit: 2 })
      .set("cookie", cookie)
      .expect(200);
    expect(first.body.items.map((item: { text: string }) => item.text)).toEqual(["três", "dois"]);
    const second = await request
      .get("/api/v1/publications")
      .query({ limit: 2, cursor: first.body.nextCursor })
      .set("cookie", cookie)
      .expect(200);
    expect(second.body.items.map((item: { text: string }) => item.text)).toEqual(["um"]);
    expect(second.body.nextCursor).toBeNull();
    const strangerId = (
      await prisma.publication.findFirstOrThrow({ where: { userId: stranger.userId } })
    ).id;
    await request.get(`/api/v1/publications/${strangerId}`).set("cookie", cookie).expect(404);
  });
});
