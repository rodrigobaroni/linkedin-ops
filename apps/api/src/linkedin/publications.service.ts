import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
  IdempotencyKeySchema,
  type Page,
  type Publication,
  type PublicationError,
  type PublicationListQuery,
} from "@linkedin-ops/contracts";
import type { TokenVault } from "@linkedin-ops/domain";
import {
  newId,
  TokenVaultError,
  type PrismaClient,
  type SealedCredential,
} from "@linkedin-ops/domain";
import type { Logger } from "pino";
import { ProblemError } from "../common/problem.error.js";
import { API_LOGGER } from "../logging/logger.js";
import { PRISMA_CLIENT } from "../prisma/prisma.module.js";
import type { AuthenticatedSession } from "../session/session.service.js";
import { FixedWindowLimiter } from "./fixed-window-limiter.js";
import {
  LINKEDIN_HTTP_TIMEOUT_MS,
  LinkedInApiClient,
  textPostPayload,
  type LinkedInPostOutcome,
} from "./linkedin.client.js";
import { linkedinPostUrl } from "./linkedin.constants.js";
import { personUrn, PUBLISH_SCOPE, TOKEN_VAULT } from "./linkedin-oauth.service.js";
import { LINKEDIN_RATE_LIMITS, type LinkedInRateLimits } from "./rate-limits.js";

/** PT-BR message stored with each failure code (shown by the web; never LinkedIn's raw body). */
const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  LINKEDIN_UNAUTHORIZED: "O LinkedIn recusou o acesso: reconecte a conta.",
  LINKEDIN_FORBIDDEN: "O LinkedIn negou a permissão de publicar: reconecte a conta.",
  LINKEDIN_RATE_LIMITED:
    "Limite de publicações do LinkedIn atingido. Nada foi publicado; tente mais tarde.",
  LINKEDIN_REJECTED: "O LinkedIn rejeitou o post. Nada foi publicado.",
  TOKEN_DECRYPT_FAILED: "Não foi possível ler a credencial do LinkedIn: reconecte a conta.",
  TIMEOUT: "O LinkedIn não respondeu a tempo. Confira o perfil antes de tentar de novo.",
  NETWORK_ERROR: "Falha de rede ao falar com o LinkedIn. Confira o perfil antes de tentar de novo.",
  LINKEDIN_SERVER_ERROR:
    "O LinkedIn respondeu com erro interno. Confira o perfil antes de tentar de novo.",
  POST_URN_MISSING: "O LinkedIn aceitou o envio sem devolver o post. Confira o perfil.",
  UNEXPECTED_STATUS: "Resposta inesperada do LinkedIn. Confira o perfil antes de tentar de novo.",
  CLAIM_ABANDONED:
    "A publicação foi interrompida sem resultado conhecido. Confira o perfil antes de tentar de novo.",
};

/**
 * A live attempt finishes within one HTTP timeout plus the database round-trips; an `IN_PROGRESS` claim older
 * than twice that was abandoned (process crash, restart) between the claim and its result.
 */
export const ABANDONED_CLAIM_MS = 2 * LINKEDIN_HTTP_TIMEOUT_MS;

type PublicationRow = Awaited<ReturnType<PrismaClient["publication"]["findUniqueOrThrow"]>>;

/**
 * "Publicar agora" of free text (T-039 núcleo, ADR-0003, Sentinela condition 7). The publication row with
 * its unique `idempotency_key` is the claim and is committed **before** LinkedIn is called; the same
 * `Idempotency-Key` replays the stored result without a second call. Anything that does not prove the post
 * was rejected becomes `AMBIGUOUS` and is never retried automatically.
 */
@Injectable()
export class PublicationsService {
  readonly #publishLimiter: FixedWindowLimiter;

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(TOKEN_VAULT) private readonly vault: TokenVault,
    @Inject(LinkedInApiClient) private readonly client: LinkedInApiClient,
    @Inject(LINKEDIN_RATE_LIMITS) limits: LinkedInRateLimits,
    @Inject(API_LOGGER) private readonly logger: Logger,
  ) {
    this.#publishLimiter = new FixedWindowLimiter(limits.publishPerUser, limits.windowMs);
  }

  async publishNow(
    session: AuthenticatedSession,
    text: string,
    idempotencyKeyHeader: string | undefined,
    correlationId: string,
  ): Promise<Publication> {
    const idempotencyKey = `pub:manual:${session.userId}:${parseIdempotencyKey(idempotencyKeyHeader)}`;
    const existing = await this.prisma.publication.findUnique({ where: { idempotencyKey } });
    if (existing) return this.replay(existing, text, correlationId);

    this.#publishLimiter.consume(
      session.userId,
      "Muitas publicações em pouco tempo; aguarde alguns minutos",
    );
    const token = await this.prisma.oAuthToken.findUnique({
      where: { userId_provider: { userId: session.userId, provider: "LINKEDIN" } },
    });
    if (!token || token.status !== "ACTIVE" || !token.scopes.includes(PUBLISH_SCOPE)) {
      throw new ProblemError("LINKEDIN_REAUTH_REQUIRED", {
        detail: "Conecte a conta do LinkedIn antes de publicar",
      });
    }
    if (token.accessExpiresAt.getTime() <= Date.now()) {
      await this.prisma.oAuthToken.update({ where: { id: token.id }, data: { status: "EXPIRED" } });
      throw new ProblemError("LINKEDIN_REAUTH_REQUIRED", {
        detail: "A conexão com o LinkedIn expirou; reconecte",
      });
    }
    // A new key for a text whose last attempt has an unknown outcome would risk a duplicate post.
    const unresolved = await this.prisma.publication.findFirst({
      where: {
        userId: session.userId,
        body: text,
        status: { in: ["IN_PROGRESS", "AMBIGUOUS"] },
        // A concurrent request with this same key is a double click: it must reach the claim and replay.
        idempotencyKey: { not: idempotencyKey },
      },
      select: { id: true },
    });
    if (unresolved) {
      throw new ProblemError("PUBLICATION_ALREADY_EXISTS", {
        detail:
          "Este texto tem uma publicação com resultado incerto; confira o perfil no LinkedIn antes",
      });
    }

    const authorUrn = personUrn(token.providerSubject);
    const fingerprint = createHash("sha256").update(textPostPayload(authorUrn, text)).digest("hex");
    const publicationId = newId();
    try {
      await this.prisma.publication.create({
        data: {
          id: publicationId,
          userId: session.userId,
          body: text,
          idempotencyKey,
          status: "IN_PROGRESS",
          attempt: 1,
          requestFingerprint: fingerprint,
          startedAt: new Date(),
        },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Lost a concurrent double click: the winner owns the call; answer with its row.
      return this.replay(
        await this.prisma.publication.findUniqueOrThrow({ where: { idempotencyKey } }),
        text,
        correlationId,
      );
    }

    const sealed: SealedCredential = {
      accessTokenCiphertext: token.accessTokenCiphertext,
      refreshTokenCiphertext: token.refreshTokenCiphertext,
      wrappedDek: token.wrappedDek,
      keyVersion: token.keyVersion,
    };
    let outcome: LinkedInPostOutcome;
    try {
      outcome = await this.vault.withAccessToken(
        { provider: "linkedin", userId: session.userId, credentialId: token.id },
        sealed,
        (accessToken) => this.client.createTextPost(accessToken, authorUrn, text),
      );
    } catch (error) {
      // `createTextPost` never throws, so this failed before anything was sent.
      if (!(error instanceof TokenVaultError)) throw error;
      outcome = { kind: "failed", code: error.code, httpStatus: null, reauth: true };
    }
    if (outcome.kind !== "succeeded") {
      this.logger.warn(
        {
          correlationId,
          publicationId,
          outcome: outcome.kind,
          linkedinError: outcome.code,
          httpStatus: outcome.httpStatus,
        },
        "linkedin publish-now did not succeed",
      );
    }
    const finished = await this.finish(
      session.userId,
      publicationId,
      token.id,
      outcome,
      correlationId,
    );
    return toPublication(finished);
  }

  async list(
    userId: string,
    query: PublicationListQuery,
    correlationId: string,
  ): Promise<Page<Publication>> {
    if (query.cursor !== undefined && !IdempotencyKeySchema.safeParse(query.cursor).success) {
      throw new ProblemError("VALIDATION_FAILED", {
        detail: "Parâmetros de consulta inválidos",
        errors: [{ path: ["cursor"], message: "Cursor inválido" }],
      });
    }
    const rows = await this.prisma.publication.findMany({
      where: {
        userId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.draftId ? { draftId: query.draftId } : {}),
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
      },
      // uuid v7 ids are time-ordered: id order is creation order and makes a stable cursor.
      orderBy: { id: "desc" },
      take: query.limit + 1,
    });
    const page = await Promise.all(
      rows.slice(0, query.limit).map((row) => this.settleAbandoned(row, correlationId)),
    );
    return {
      items: page.map(toPublication),
      nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async get(userId: string, id: string, correlationId: string): Promise<Publication> {
    const row = await this.prisma.publication.findFirst({ where: { id, userId } });
    if (!row) throw new ProblemError("NOT_FOUND", { detail: "Publicação não encontrada" });
    return toPublication(await this.settleAbandoned(row, correlationId));
  }

  /** Same key: same text → the stored result; different text → 409 (contracts.md §1). Never re-sends. */
  private async replay(
    row: PublicationRow,
    text: string,
    correlationId: string,
  ): Promise<Publication> {
    if (row.body !== text) {
      throw new ProblemError("IDEMPOTENCY_KEY_CONFLICT", {
        detail: "Esta chave de idempotência já foi usada com outro texto",
      });
    }
    return toPublication(await this.settleAbandoned(row, correlationId));
  }

  /**
   * ADR-0003: an abandoned `IN_PROGRESS` claim may or may not have reached LinkedIn, so it becomes
   * `AMBIGUOUS` (never retried, never re-sent). Conditional update: concurrent readers settle it once.
   */
  private async settleAbandoned(
    row: PublicationRow,
    correlationId: string,
  ): Promise<PublicationRow> {
    const cutoff = new Date(Date.now() - ABANDONED_CLAIM_MS);
    if (row.status !== "IN_PROGRESS" || !row.startedAt || row.startedAt >= cutoff) return row;
    const error: PublicationError = {
      code: "CLAIM_ABANDONED",
      httpStatus: null,
      message: ERROR_MESSAGES.CLAIM_ABANDONED!,
    };
    await this.prisma.$transaction(async (tx) => {
      const settled = await tx.publication.updateMany({
        where: { id: row.id, status: "IN_PROGRESS", startedAt: { lt: cutoff } },
        data: { status: "AMBIGUOUS", finishedAt: new Date(), error },
      });
      if (settled.count === 0) return;
      await tx.auditEvent.create({
        data: {
          id: newId(),
          userId: row.userId,
          actorType: "SYSTEM",
          action: "publication.ambiguous",
          entityType: "publication",
          entityId: row.id,
          before: { status: "IN_PROGRESS" },
          after: { status: "AMBIGUOUS", errorCode: error.code },
          correlationId,
        },
      });
    });
    this.logger.warn(
      { correlationId, publicationId: row.id },
      "abandoned publication claim settled as AMBIGUOUS",
    );
    return this.prisma.publication.findUniqueOrThrow({ where: { id: row.id } });
  }

  private async finish(
    userId: string,
    publicationId: string,
    tokenId: string,
    outcome: LinkedInPostOutcome,
    correlationId: string,
  ): Promise<PublicationRow> {
    const now = new Date();
    const status =
      outcome.kind === "succeeded"
        ? "SUCCEEDED"
        : outcome.kind === "failed"
          ? "FAILED"
          : "AMBIGUOUS";
    const error: PublicationError | null =
      outcome.kind === "succeeded"
        ? null
        : {
            code: outcome.code,
            httpStatus: outcome.httpStatus,
            message: ERROR_MESSAGES[outcome.code] ?? "Falha ao publicar.",
          };
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.publication.update({
        where: { id: publicationId },
        data: {
          status,
          finishedAt: now,
          ...(outcome.kind === "succeeded"
            ? {
                externalPostId: outcome.postUrn,
                externalUrl: linkedinPostUrl(outcome.postUrn),
                publishedAt: now,
              }
            : { error: error! }),
        },
      });
      await tx.oAuthToken.update({
        where: { id: tokenId },
        data: {
          lastUsedAt: now,
          ...(outcome.kind === "failed" && outcome.reauth
            ? { status: "REAUTH_REQUIRED" as const }
            : {}),
        },
      });
      await tx.auditEvent.create({
        data: {
          id: newId(),
          userId,
          actorType: "USER",
          actorId: userId,
          action: `publication.${status.toLowerCase()}`,
          entityType: "publication",
          entityId: publicationId,
          after: {
            status,
            externalPostId: outcome.kind === "succeeded" ? outcome.postUrn : null,
            errorCode: error?.code ?? null,
          },
          correlationId,
        },
      });
      return row;
    });
  }
}

/** contracts.md §1: missing key → 400 IDEMPOTENCY_KEY_REQUIRED; a key that is not a UUID → 400 VALIDATION_FAILED. */
function parseIdempotencyKey(value: string | undefined): string {
  if (value === undefined || value.trim() === "") {
    throw new ProblemError("IDEMPOTENCY_KEY_REQUIRED", {
      detail: "Envie o cabeçalho Idempotency-Key",
    });
  }
  const parsed = IdempotencyKeySchema.safeParse(value.trim().toLowerCase());
  if (!parsed.success) {
    throw new ProblemError("VALIDATION_FAILED", {
      detail: "Cabeçalho Idempotency-Key inválido",
      errors: [{ path: ["Idempotency-Key"], message: "Expected a UUID" }],
    });
  }
  return parsed.data;
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "P2002";
}

export function toPublication(row: PublicationRow): Publication {
  return {
    id: row.id,
    draftId: row.draftId,
    draftVersionId: row.draftVersionId,
    text: row.body,
    scheduleId: row.scheduleId,
    status: row.status,
    attempt: row.attempt,
    externalPostId: row.externalPostId,
    externalUrl: row.externalUrl,
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    error: (row.error as PublicationError | null) ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
