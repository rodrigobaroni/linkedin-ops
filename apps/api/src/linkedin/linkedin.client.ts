import { Inject, Injectable } from "@nestjs/common";
import type { LinkedInClientConfig } from "@linkedin-ops/domain";
import {
  LINKEDIN_API_VERSION,
  LINKEDIN_POSTS_URL,
  LINKEDIN_RESTLI_PROTOCOL_VERSION,
  LINKEDIN_TOKEN_URL,
  LINKEDIN_USERINFO_URL,
} from "./linkedin.constants.js";
import { escapeLittleText } from "./little-text.js";

/** Injection token for the `fetch` used against LinkedIn (tests swap it for a scripted fake). */
export const LINKEDIN_FETCH = Symbol("LINKEDIN_FETCH");
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** Injection token for the configured LinkedIn client (`RuntimeEnv.linkedin`, may be `null`). */
export const LINKEDIN_CONFIG = Symbol("LINKEDIN_CONFIG");

export const LINKEDIN_HTTP_TIMEOUT_MS = 15_000;
/** oauth-and-tokens.md §2.3 step 6: token fields are bounded (4 KiB). */
const MAX_TOKEN_LENGTH = 4096;
const MAX_RESPONSE_BYTES = 64 * 1024;
/** OIDC `sub` of a LinkedIn member, the id part of `urn:li:person:<sub>` (shape seen in the T-061 probe). */
const MEMBER_SUBJECT = /^[A-Za-z0-9_-]{1,64}$/;
const POST_URN = /^urn:li:(share|ugcPost):[0-9]{1,30}$/;

/** Failure talking to LinkedIn. `code` is stable and safe to persist/show; nothing from the token or body. */
export class LinkedInApiError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus: number | null,
  ) {
    super(`LinkedIn API: ${code}${httpStatus === null ? "" : ` (HTTP ${httpStatus})`}`);
    this.name = "LinkedInApiError";
  }
}

export interface LinkedInTokenGrant {
  accessToken: string;
  expiresInSeconds: number;
  scopes: string[];
}

export interface LinkedInMember {
  sub: string;
  name: string | null;
}

/**
 * Outcome of `POST /rest/posts` (ADR-0003). Only a 201 with a post URN is a success; any answer that does
 * not prove the post was rejected (5xx, timeout, network, 201 without URN) is `ambiguous` and must never be
 * retried automatically. 401/403 mean the credential can no longer publish (`reauth`).
 */
export type LinkedInPostOutcome =
  | { kind: "succeeded"; postUrn: string }
  | { kind: "failed"; code: string; httpStatus: number | null; reauth: boolean }
  | { kind: "ambiguous"; code: string; httpStatus: number | null };

/**
 * Adapter over the LinkedIn official API (docs/security/linkedin-policy.md): token exchange, OIDC
 * `userinfo` and text posts. Native `fetch`, explicit timeouts, no redirects followed, bounded bodies. The
 * access token is a parameter only; it is never logged, stored or put into an error.
 */
@Injectable()
export class LinkedInClient {
  constructor(
    @Inject(LINKEDIN_FETCH) private readonly fetch: FetchLike,
    @Inject(LINKEDIN_CONFIG) private readonly config: LinkedInClientConfig | null,
  ) {}

  get configured(): LinkedInClientConfig | null {
    return this.config;
  }

  /** Authorization code → access token (RFC 6749 §4.1.3), with the byte-identical redirect URI. */
  async exchangeCode(code: string): Promise<LinkedInTokenGrant> {
    const config = this.requireConfig();
    const response = await this.call(LINKEDIN_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: config.redirectUri,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }).toString(),
    });
    if (!response.ok) throw new LinkedInApiError("TOKEN_EXCHANGE_FAILED", response.status);
    const body = await readJson(response);
    const accessToken = body?.access_token;
    const expiresIn = body?.expires_in;
    if (
      typeof accessToken !== "string" ||
      accessToken.length === 0 ||
      accessToken.length > MAX_TOKEN_LENGTH ||
      typeof expiresIn !== "number" ||
      !Number.isInteger(expiresIn) ||
      expiresIn <= 0
    ) {
      throw new LinkedInApiError("TOKEN_RESPONSE_INVALID", response.status);
    }
    const scope = typeof body?.scope === "string" ? body.scope : "";
    return {
      accessToken,
      expiresInSeconds: expiresIn,
      scopes: [...new Set(scope.split(/[\s,]+/).filter(Boolean))].sort(),
    };
  }

  /** `GET /v2/userinfo` (OIDC): `sub` becomes the author URN, `name` is shown on the confirmation. */
  async userinfo(accessToken: string): Promise<LinkedInMember> {
    const response = await this.call(LINKEDIN_USERINFO_URL, {
      method: "GET",
      headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
    });
    if (!response.ok) throw new LinkedInApiError("USERINFO_FAILED", response.status);
    const body = await readJson(response);
    const sub = body?.sub;
    if (typeof sub !== "string" || !MEMBER_SUBJECT.test(sub)) {
      throw new LinkedInApiError("USERINFO_INVALID", response.status);
    }
    const name = typeof body?.name === "string" ? cleanDisplayName(body.name) : null;
    return { sub, name };
  }

  /** One text post as the member (`POST /rest/posts`, pinned `LinkedIn-Version`). Never retries. */
  async createTextPost(
    accessToken: string,
    authorUrn: string,
    text: string,
  ): Promise<LinkedInPostOutcome> {
    let response: Response;
    try {
      response = await this.call(LINKEDIN_POSTS_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
          "linkedin-version": LINKEDIN_API_VERSION,
          "x-restli-protocol-version": LINKEDIN_RESTLI_PROTOCOL_VERSION,
        },
        body: textPostPayload(authorUrn, text),
      });
    } catch (error) {
      // The request may have reached LinkedIn: the outcome is unknown (ADR-0003 AMBIGUOUS).
      const code = error instanceof LinkedInApiError ? error.code : "NETWORK_ERROR";
      return { kind: "ambiguous", code, httpStatus: null };
    }
    await response.body?.cancel().catch(() => undefined);
    return classifyPostResponse(response.status, response.headers.get("x-restli-id"));
  }

  private requireConfig(): LinkedInClientConfig {
    if (!this.config) throw new LinkedInApiError("NOT_CONFIGURED", null);
    return this.config;
  }

  private async call(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetch(url, {
        ...init,
        redirect: "manual",
        signal: AbortSignal.timeout(LINKEDIN_HTTP_TIMEOUT_MS),
      });
    } catch (error) {
      const name = (error as { name?: unknown } | null)?.name;
      throw new LinkedInApiError(
        name === "TimeoutError" || name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR",
        null,
      );
    }
  }
}

/** Exact JSON body sent to `POST /rest/posts`; its sha256 is persisted before the call (reconciliation). */
export function textPostPayload(authorUrn: string, text: string): string {
  return JSON.stringify({
    author: authorUrn,
    commentary: escapeLittleText(text),
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  });
}

export function classifyPostResponse(status: number, restliId: string | null): LinkedInPostOutcome {
  if (status === 201) {
    return restliId !== null && POST_URN.test(restliId)
      ? { kind: "succeeded", postUrn: restliId }
      : { kind: "ambiguous", code: "POST_URN_MISSING", httpStatus: status };
  }
  if (status === 401)
    return { kind: "failed", code: "LINKEDIN_UNAUTHORIZED", httpStatus: status, reauth: true };
  if (status === 403)
    return { kind: "failed", code: "LINKEDIN_FORBIDDEN", httpStatus: status, reauth: true };
  if (status === 429)
    return { kind: "failed", code: "LINKEDIN_RATE_LIMITED", httpStatus: status, reauth: false };
  if (status >= 400 && status < 500) {
    return { kind: "failed", code: "LINKEDIN_REJECTED", httpStatus: status, reauth: false };
  }
  return {
    kind: "ambiguous",
    code: status >= 500 ? "LINKEDIN_SERVER_ERROR" : "UNEXPECTED_STATUS",
    httpStatus: status,
  };
}

/** External display name: control characters stripped, bounded to the contract (1..200). */
function cleanDisplayName(value: string): string | null {
  // C0/C1 control characters (terminal and log injection).
  // eslint-disable-next-line no-control-regex
  const controls = /[\u0000-\u001f\u007f-\u009f]/g;
  const cleaned = value.replace(controls, "").trim().slice(0, 200);
  return cleaned.length > 0 ? cleaned : null;
}

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!/^application\/json\b/i.test(contentType)) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  const raw = await response.text();
  if (raw.length > MAX_RESPONSE_BYTES) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
