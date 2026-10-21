import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { beforeAll, describe, expect, it } from "vitest";

type SigningKey = Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];
import {
  hashNonce,
  LINKEDIN_OMITS_ID_TOKEN_NONCE,
  LinkedInIdTokenVerifier,
} from "./id-token.verifier.js";
import { LINKEDIN_OIDC_ISSUER } from "./linkedin.constants.js";

const CONFIG = {
  clientId: "86clientid",
  clientSecret: "secret",
  redirectUri: "https://ops.example.test/api/v1/auth/linkedin/callback",
  pkce: "disabled" as const,
};
const NONCE = "nonce-value-from-connect";
const SUB = "x1Y2z3_member";

let signingKey: SigningKey;
let foreignKey: SigningKey;
let verifier: LinkedInIdTokenVerifier;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  signingKey = pair.privateKey;
  foreignKey = (await generateKeyPair("RS256")).privateKey;
  const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: "li-1", alg: "RS256", use: "sig" };
  verifier = new LinkedInIdTokenVerifier(createLocalJWKSet({ keys: [jwk] }), CONFIG);
});

interface TokenOptions {
  key?: SigningKey;
  claims?: Record<string, unknown>;
  iss?: string;
  aud?: string;
  iat?: number;
  exp?: number;
}

async function idToken(options: TokenOptions = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ nonce: NONCE, ...options.claims })
    .setProtectedHeader({ alg: "RS256", kid: "li-1" })
    .setSubject(SUB)
    .setIssuer(options.iss ?? LINKEDIN_OIDC_ISSUER)
    .setAudience(options.aud ?? CONFIG.clientId)
    .setIssuedAt(options.iat ?? now)
    .setExpirationTime(options.exp ?? now + 3600)
    .sign(options.key ?? signingKey);
}

const expected = { nonceHash: hashNonce(NONCE), sub: SUB };

describe("LinkedInIdTokenVerifier (ADR-0007 item 2, Sentinela A-2)", () => {
  it("accepts a token signed by the JWKS with the exact iss, aud, nonce and sub", async () => {
    await expect(verifier.verify(await idToken(), expected)).resolves.toBeUndefined();
  });

  it("works with LinkedIn's real JWKS shape: one RSA key with kid but no alg/use (T-061 probe)", async () => {
    const pair = await generateKeyPair("RS256");
    const bare: JWK = { ...(await exportJWK(pair.publicKey)), kid: "li-1" };
    const linkedinShaped = new LinkedInIdTokenVerifier(createLocalJWKSet({ keys: [bare] }), CONFIG);
    await expect(
      linkedinShaped.verify(await idToken({ key: pair.privateKey }), expected),
    ).resolves.toBeUndefined();
  });

  it.each<[string, () => Promise<string>, { nonceHash: string; sub: string }?]>([
    ["a signature from a key outside the JWKS", () => idToken({ key: foreignKey })],
    ["another audience", () => idToken({ aud: "someone-else" })],
    ["another issuer", () => idToken({ iss: "https://evil.example/oauth" })],
    ["an expired token", () => idToken({ exp: Math.floor(Date.now() / 1000) - 120 })],
    ["an iat older than the max age", () => idToken({ iat: Math.floor(Date.now() / 1000) - 3600 })],
    ["a different nonce", () => idToken({ claims: { nonce: "other" } })],
    ["an empty nonce", () => idToken({ claims: { nonce: "" } })],
    ["a numeric nonce", () => idToken({ claims: { nonce: 42 } })],
    ["a null nonce", () => idToken({ claims: { nonce: null } })],
    [
      "a sub different from userinfo",
      () => idToken(),
      { nonceHash: hashNonce(NONCE), sub: "other" },
    ],
    [
      "a tampered payload",
      async () => {
        const [header, , signature] = (await idToken()).split(".");
        const forged = Buffer.from(
          JSON.stringify({ sub: SUB, nonce: NONCE, aud: CONFIG.clientId }),
        ).toString("base64url");
        return `${header}.${forged}.${signature}`;
      },
    ],
    [
      "alg none",
      async () => {
        const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
        const body = Buffer.from(JSON.stringify({ sub: SUB, nonce: NONCE })).toString("base64url");
        return `${header}.${body}.`;
      },
    ],
  ])("rejects %s", async (_name, token, override) => {
    await expect(verifier.verify(await token(), override ?? expected)).rejects.toMatchObject({
      code: "ID_TOKEN_INVALID",
    });
  });

  it("rejects an HS256 token even if keyed with public material (alg allowlist)", async () => {
    const hs = await new SignJWT({ nonce: NONCE })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(SUB)
      .setIssuer(LINKEDIN_OIDC_ISSUER)
      .setAudience(CONFIG.clientId)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("x".repeat(32)));
    await expect(verifier.verify(hs, expected)).rejects.toMatchObject({ code: "ID_TOKEN_INVALID" });
  });
});

describe("LinkedIn nonce exception (absent nonce, Sentinela 2026-10-21)", () => {
  const absent = (options: TokenOptions = {}) =>
    idToken({ ...options, claims: { nonce: undefined, ...options.claims } });

  it("is a single code constant, switched on by the T-061 probe evidence", () => {
    expect(LINKEDIN_OMITS_ID_TOKEN_NONCE).toBe(true);
  });

  it("accepts an id_token WITHOUT nonce when everything else holds (LinkedIn's real shape)", async () => {
    await expect(verifier.verify(await absent(), expected)).resolves.toBeUndefined();
  });

  it.each<[string, () => Promise<string>, { nonceHash: string; sub: string }?]>([
    ["a foreign signature", () => absent({ key: foreignKey })],
    ["another audience", () => absent({ aud: "someone-else" })],
    ["another issuer", () => absent({ iss: "https://evil.example/oauth" })],
    ["an expired token", () => absent({ exp: Math.floor(Date.now() / 1000) - 120 })],
    ["an old iat", () => absent({ iat: Math.floor(Date.now() / 1000) - 3600 })],
    [
      "a sub different from userinfo",
      () => absent(),
      { nonceHash: hashNonce(NONCE), sub: "other" },
    ],
  ])("still rejects an absent-nonce token with %s", async (_name, token, override) => {
    await expect(verifier.verify(await token(), override ?? expected)).rejects.toMatchObject({
      code: "ID_TOKEN_INVALID",
    });
  });
});
