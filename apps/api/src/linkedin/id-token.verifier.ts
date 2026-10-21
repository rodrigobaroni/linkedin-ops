import { createHash, timingSafeEqual } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { LinkedInClientConfig } from "@linkedin-ops/domain";
import { createRemoteJWKSet, customFetch, jwtVerify, type JWTVerifyGetKey } from "jose";
import { LINKEDIN_CONFIG, LinkedInApiError, type FetchLike } from "./linkedin.client.js";
import { LINKEDIN_JWKS_URL, LINKEDIN_OIDC_ISSUER } from "./linkedin.constants.js";

/** Injection token for the key resolver of LinkedIn's id_token signatures (tests use a local JWKS). */
export const LINKEDIN_JWKS = Symbol("LINKEDIN_JWKS");

/** Short clock skew allowed on `exp`/`iat`, and the oldest `iat` accepted for a token just issued. */
export const ID_TOKEN_CLOCK_TOLERANCE_SECONDS = 60;
export const ID_TOKEN_MAX_AGE_SECONDS = 10 * 60;

/** Remote JWKS through the same `fetch` as every LinkedIn call; cached, with a cooldown on refetch. */
export function remoteLinkedInJwks(fetch: FetchLike): JWTVerifyGetKey {
  return createRemoteJWKSet(new URL(LINKEDIN_JWKS_URL), {
    timeoutDuration: 5_000,
    cooldownDuration: 30_000,
    cacheMaxAge: 6 * 60 * 60 * 1000,
    [customFetch]: (url, init) => fetch(url, { ...init, redirect: "manual" }),
  });
}

/** SHA-256 (hex) of the OIDC nonce; only this is persisted (`oauth_states.nonce_hash`). */
export function hashNonce(nonce: string): string {
  return createHash("sha256").update(nonce).digest("hex");
}

/**
 * LinkedIn interoperability exception, approved by the Sentinela on 2026-10-21 (PR #84) with evidence in
 * docs/security/linkedin-api-proof.md: LinkedIn's id_token omits `nonce` even when the authorization request
 * sends one, which does NOT conform to OIDC Core 1.0 (§2: a nonce sent in the request MUST be in the id_token;
 * §3.1.3.7 item 11: the client MUST check it). Only the *absence* is tolerated; a present nonce is always checked. Changing this requires a new
 * probe run and the Sentinela's sign-off. Deliberately a code constant, never configuration.
 */
export const LINKEDIN_OMITS_ID_TOKEN_NONCE = true;

/**
 * ADR-0007 item 2 / oauth-and-tokens.md §2.4: the id_token must be RS256-signed by a key of LinkedIn's
 * JWKS, `iss`/`aud` exact, `exp`/`iat` within a short tolerance and `sub` equal to the `userinfo` subject.
 * `nonce`: present → must equal the one bound to the state (empty, non-string or different fails); absent
 * → accepted only under `LINKEDIN_OMITS_ID_TOKEN_NONCE`, with every other check still required (and, around
 * it, the single-use state bound to session + user and the server-side code exchange). Any failure is
 * `ID_TOKEN_INVALID` (nothing about the token is echoed); the callback then stores nothing.
 */
@Injectable()
export class LinkedInIdTokenVerifier {
  constructor(
    @Inject(LINKEDIN_JWKS) private readonly jwks: JWTVerifyGetKey,
    @Inject(LINKEDIN_CONFIG) private readonly config: LinkedInClientConfig | null,
  ) {}

  async verify(idToken: string, expected: { nonceHash: string; sub: string }): Promise<void> {
    if (!this.config) throw new LinkedInApiError("NOT_CONFIGURED", null);
    let payload: Record<string, unknown>;
    try {
      ({ payload } = await jwtVerify(idToken, this.jwks, {
        algorithms: ["RS256"],
        issuer: LINKEDIN_OIDC_ISSUER,
        audience: this.config.clientId,
        clockTolerance: ID_TOKEN_CLOCK_TOLERANCE_SECONDS,
        maxTokenAge: ID_TOKEN_MAX_AGE_SECONDS,
        requiredClaims: ["exp", "iat", "sub"],
      }));
    } catch {
      throw new LinkedInApiError("ID_TOKEN_INVALID", null);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "nonce")) {
      const nonce = payload.nonce;
      if (
        typeof nonce !== "string" ||
        nonce.length === 0 ||
        !sameHex(hashNonce(nonce), expected.nonceHash)
      ) {
        throw new LinkedInApiError("ID_TOKEN_INVALID", null);
      }
    } else if (!LINKEDIN_OMITS_ID_TOKEN_NONCE) {
      throw new LinkedInApiError("ID_TOKEN_INVALID", null);
    }
    if (payload.sub !== expected.sub) throw new LinkedInApiError("ID_TOKEN_INVALID", null);
  }
}

function sameHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}
