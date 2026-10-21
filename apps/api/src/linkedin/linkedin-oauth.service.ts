import { createHmac, randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { LinkedInCallbackQuery, LinkedInIntegration } from "@linkedin-ops/contracts";
import type { TokenVault } from "@linkedin-ops/domain";
import { newId, type PrismaClient, type RuntimeEnv } from "@linkedin-ops/domain";
import type { Logger } from "pino";
import { ProblemError } from "../common/problem.error.js";
import { RUNTIME_ENV } from "../config/runtime-env.module.js";
import { API_LOGGER } from "../logging/logger.js";
import { PRISMA_CLIENT } from "../prisma/prisma.module.js";
import type { AuthenticatedSession } from "../session/session.service.js";
import { FixedWindowLimiter } from "./fixed-window-limiter.js";
import { LinkedInApiError, LinkedInClient } from "./linkedin.client.js";
import { LINKEDIN_AUTHORIZE_URL, LINKEDIN_SCOPES } from "./linkedin.constants.js";

export const TOKEN_VAULT = Symbol("TOKEN_VAULT");

/** ADR-0007 item 2: a state lives at most 10 minutes. */
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
/** Scope without which the connection is useless and is not stored (oauth-and-tokens.md §2.3 step 7). */
export const PUBLISH_SCOPE = "w_member_social";
/** Fixed UI route the callback returns to; the only `returnTo` value (never a raw URL). */
export const CALLBACK_RETURN_PATH = "/publicar";

/** `?linkedin=<result>` appended to the return route; the web maps it to a message. */
export type CallbackResult =
  "connected" | "denied" | "expired" | "invalid" | "scope_missing" | "error" | "unavailable";

interface ClaimedState {
  user_id: string;
  session_id: string;
  live: boolean;
}

/**
 * LinkedIn OAuth 2.0 authorization code flow for the owner (T-038 núcleo, ADR-0007 item 2 + N1/N3,
 * oauth-and-tokens.md §2). PKCE stays `disabled` until G-01 proves it (boot refuses `required`). The access
 * token only exists in memory between the exchange and `TokenVault.seal`; it is never logged.
 */
@Injectable()
export class LinkedInOAuthService {
  readonly #connectLimiter = new FixedWindowLimiter(10, 10 * 60 * 1000);
  readonly #callbackLimiter = new FixedWindowLimiter(30, 10 * 60 * 1000);

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(RUNTIME_ENV) private readonly env: RuntimeEnv,
    @Inject(TOKEN_VAULT) private readonly vault: TokenVault,
    @Inject(LinkedInClient) private readonly client: LinkedInClient,
    @Inject(API_LOGGER) private readonly logger: Logger,
  ) {}

  /** `POST /integrations/linkedin/connect`: new single-use state bound to this session (replaces any other). */
  async connect(session: AuthenticatedSession): Promise<string> {
    const config = this.client.configured;
    if (!config || !this.env.encryptionKeyRing) {
      throw new ProblemError("SERVICE_NOT_READY", {
        detail: "A integração com o LinkedIn não está configurada neste ambiente",
      });
    }
    this.#connectLimiter.consume(
      session.userId,
      "Muitas tentativas de conexão; aguarde alguns minutos",
    );

    const state = randomBytes(32).toString("base64url");
    await this.prisma.$transaction([
      // One active state per session: a new connect invalidates the previous one.
      this.prisma.oAuthState.deleteMany({ where: { sessionId: session.id, usedAt: null } }),
      this.prisma.oAuthState.create({
        data: {
          id: newId(),
          userId: session.userId,
          sessionId: session.id,
          stateHash: this.hashState(state),
          scopes: [...LINKEDIN_SCOPES],
          returnTo: "publish",
          expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
        },
      }),
    ]);

    const url = new URL(LINKEDIN_AUTHORIZE_URL);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", config.clientId);
    url.searchParams.set("redirect_uri", config.redirectUri);
    url.searchParams.set("scope", LINKEDIN_SCOPES.join(" "));
    url.searchParams.set("state", state);
    return url.toString();
  }

  /**
   * `GET /auth/linkedin/callback`. N1: the state is claimed by one conditional `UPDATE` before anything else
   * (and before any LinkedIn call), on the `code` and the `error` paths alike. The claim does not filter by
   * session, so *any* callback carrying a known state burns it; session, user and expiry are then checked on
   * the claimed row. Returns the UI URL to redirect to; never throws for an OAuth outcome.
   */
  async handleCallback(
    query: LinkedInCallbackQuery,
    session: AuthenticatedSession | null,
    clientKey: string,
    correlationId: string,
  ): Promise<string> {
    this.#callbackLimiter.consume(clientKey, "Muitas tentativas; aguarde alguns minutos");
    // The application clock, bound as a parameter, goes through the same serialization as the stored
    // `expires_at`; SQL `now()` would be skewed by the session TimeZone with the pg driver adapter.
    const now = new Date();
    const rows = await this.prisma.$queryRaw<ClaimedState[]>`
      UPDATE oauth_states SET used_at = ${now}
      WHERE state_hash = ${this.hashState(query.state)} AND used_at IS NULL
      RETURNING user_id::text AS user_id, session_id::text AS session_id, (expires_at > ${now}) AS live`;
    const claimed = rows[0];
    if (!claimed) return this.returnUrl("invalid");
    if (!claimed.live) return this.returnUrl("expired");
    if (!session || session.id !== claimed.session_id || session.userId !== claimed.user_id) {
      return this.returnUrl("invalid");
    }
    if (query.error !== undefined) {
      // Only the class is logged; error_description is untrusted text from the query string.
      this.logger.info(
        { correlationId, oauthError: query.error.slice(0, 64) },
        "linkedin authorization not granted",
      );
      return this.returnUrl("denied");
    }
    const config = this.client.configured;
    if (!config || !this.env.encryptionKeyRing || query.code === undefined)
      return this.returnUrl("unavailable");

    try {
      const grant = await this.client.exchangeCode(query.code);
      if (!grant.scopes.includes(PUBLISH_SCOPE)) {
        this.logger.warn(
          { correlationId, scopes: grant.scopes },
          "linkedin grant without w_member_social",
        );
        return this.returnUrl("scope_missing");
      }
      const member = await this.client.userinfo(grant.accessToken);
      await this.storeCredential(session, grant, member, correlationId);
      return this.returnUrl("connected");
    } catch (error) {
      if (!(error instanceof LinkedInApiError)) throw error;
      this.logger.warn(
        { correlationId, linkedinError: error.code, httpStatus: error.httpStatus },
        "linkedin oauth callback failed",
      );
      return this.returnUrl("error");
    }
  }

  /** `GET /integrations/linkedin`: connection metadata, never the token. */
  async status(userId: string): Promise<LinkedInIntegration> {
    const token = await this.prisma.oAuthToken.findUnique({
      where: { userId_provider: { userId, provider: "LINKEDIN" } },
    });
    if (!token) {
      return {
        status: "DISCONNECTED",
        scopes: [],
        accessExpiresAt: null,
        memberUrn: null,
        memberName: null,
      };
    }
    const expired = token.accessExpiresAt.getTime() <= Date.now();
    return {
      status:
        token.status === "ACTIVE"
          ? expired
            ? "EXPIRED"
            : "ACTIVE"
          : token.status === "EXPIRED"
            ? "EXPIRED"
            : "REAUTH_REQUIRED",
      scopes: [...token.scopes].sort(),
      accessExpiresAt: token.accessExpiresAt.toISOString(),
      memberUrn: personUrn(token.providerSubject),
      memberName: token.memberName,
    };
  }

  /** `DELETE /integrations/linkedin`: removes the stored credential (local revocation; idempotent). */
  async disconnect(session: AuthenticatedSession, correlationId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const token = await tx.oAuthToken.findUnique({
        where: { userId_provider: { userId: session.userId, provider: "LINKEDIN" } },
        select: { id: true, providerSubject: true },
      });
      if (!token) return;
      await tx.oAuthToken.delete({ where: { id: token.id } });
      await tx.user.update({ where: { id: session.userId }, data: { linkedinMemberUrn: null } });
      await tx.oAuthState.deleteMany({ where: { userId: session.userId } });
      await tx.auditEvent.create({
        data: {
          id: newId(),
          userId: session.userId,
          actorType: "USER",
          actorId: session.userId,
          action: "integration.linkedin.disconnect",
          entityType: "oauth_token",
          entityId: token.id,
          before: { memberUrn: personUrn(token.providerSubject) },
          correlationId,
        },
      });
    });
  }

  private async storeCredential(
    session: AuthenticatedSession,
    grant: { accessToken: string; expiresInSeconds: number; scopes: string[] },
    member: { sub: string; name: string | null },
    correlationId: string,
  ): Promise<void> {
    const memberUrn = personUrn(member.sub);
    const accessExpiresAt = new Date(Date.now() + grant.expiresInSeconds * 1000);
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.oAuthToken.findUnique({
        where: { userId_provider: { userId: session.userId, provider: "LINKEDIN" } },
        select: { id: true, providerSubject: true },
      });
      // The AAD binds the ciphertext to the row id, so a reconnect re-seals under the same id with a new DEK.
      const credentialId = existing?.id ?? newId();
      const sealed = this.vault.seal(
        { provider: "linkedin", userId: session.userId, credentialId },
        { accessToken: grant.accessToken },
      );
      const data = {
        providerSubject: member.sub,
        memberName: member.name,
        accessTokenCiphertext: new Uint8Array(sealed.accessTokenCiphertext),
        refreshTokenCiphertext: null,
        wrappedDek: new Uint8Array(sealed.wrappedDek),
        keyVersion: sealed.keyVersion,
        scopes: grant.scopes,
        accessExpiresAt,
        refreshExpiresAt: null,
        status: "ACTIVE" as const,
        lastRefreshedAt: null,
      };
      await tx.oAuthToken.upsert({
        where: { userId_provider: { userId: session.userId, provider: "LINKEDIN" } },
        create: { id: credentialId, userId: session.userId, provider: "LINKEDIN", ...data },
        update: data,
      });
      await tx.user.update({
        where: { id: session.userId },
        data: { linkedinMemberUrn: memberUrn },
      });
      await tx.oAuthState.deleteMany({ where: { sessionId: session.id } });
      await tx.auditEvent.create({
        data: {
          id: newId(),
          userId: session.userId,
          actorType: "USER",
          actorId: session.userId,
          action: "integration.linkedin.connect",
          entityType: "oauth_token",
          entityId: credentialId,
          before: existing ? { memberUrn: personUrn(existing.providerSubject) } : undefined,
          after: {
            memberUrn,
            scopes: grant.scopes,
            accessExpiresAt: accessExpiresAt.toISOString(),
          },
          correlationId,
        },
      });
    });
    // TODO(T-015): rotate the local session here (oauth-and-tokens.md §2.3 step 8) once SessionService
    // exposes rotation; the callback is a top-level navigation, so the new cookie can be set on this reply.
  }

  /** HMAC-SHA-256 under the session secret, domain-separated: the raw state is never persisted. */
  private hashState(state: string): string {
    return createHmac("sha256", this.env.sessionSecret)
      .update(`oauth-state|${state}`)
      .digest("hex");
  }

  private returnUrl(result: CallbackResult): string {
    const url = new URL(CALLBACK_RETURN_PATH, this.env.appBaseUrl);
    url.searchParams.set("linkedin", result);
    return url.toString();
  }
}

export function personUrn(sub: string): string {
  return `urn:li:person:${sub}`;
}
