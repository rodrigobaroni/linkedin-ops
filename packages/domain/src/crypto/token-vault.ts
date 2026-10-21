import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { EncryptionKeyRing } from "../env/runtime.js";

/**
 * Envelope encryption of OAuth credentials at rest (ADR-0004 items 1, 2, 5, 13). Every credential gets a
 * random 256-bit DEK; each token is sealed with AES-256-GCM under the DEK and the DEK is wrapped with the
 * active KEK, each operation with its own random 96-bit nonce. Frames are
 * `schemaVersion(1) || nonce(12) || ciphertext || tag(16)`, bound to the canonical AAD
 * `"<schemaVersion>|<provider>|<userId>|<credentialId>|<tokenType>"`. Any mismatch fails closed with a
 * generic `TokenVaultError`, never with plaintext or key material in the message.
 */

export const TOKEN_VAULT_SCHEMA_VERSION = 1;

const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const DEK_BYTES = 32;
const HEADER_BYTES = 1 + NONCE_BYTES;
const WRAPPED_DEK_FRAME_BYTES = HEADER_BYTES + DEK_BYTES + TAG_BYTES;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type VaultProvider = "linkedin";
export type VaultTokenType = "access" | "refresh";

/** Identity the ciphertexts are bound to: moving a frame to another row, column or user fails. */
export interface CredentialRef {
  provider: VaultProvider;
  userId: string;
  credentialId: string;
}

/** Exactly the persisted envelope columns of `OAuthToken` (ADR-0004 item 1). */
export interface SealedCredential {
  accessTokenCiphertext: Uint8Array;
  refreshTokenCiphertext: Uint8Array | null;
  wrappedDek: Uint8Array;
  keyVersion: string;
}

export type TokenVaultErrorCode =
  "VAULT_UNAVAILABLE" | "TOKEN_DECRYPT_FAILED" | "INVALID_CREDENTIAL_REF";

export class TokenVaultError extends Error {
  readonly code: TokenVaultErrorCode;

  constructor(code: TokenVaultErrorCode) {
    super(`Token vault: ${code}`);
    this.name = "TokenVaultError";
    this.code = code;
  }
}

function canonicalAad(ref: CredentialRef, tokenType: VaultTokenType | "dek"): Buffer {
  if (ref.provider !== "linkedin" || !UUID.test(ref.userId) || !UUID.test(ref.credentialId)) {
    throw new TokenVaultError("INVALID_CREDENTIAL_REF");
  }
  return Buffer.from(
    `${TOKEN_VAULT_SCHEMA_VERSION}|${ref.provider}|${ref.userId}|${ref.credentialId}|${tokenType}`,
    "utf8",
  );
}

function seal(key: Uint8Array, plaintext: Uint8Array, aad: Buffer): Buffer {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce, { authTagLength: TAG_BYTES });
  cipher.setAAD(aad);
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([Buffer.of(TOKEN_VAULT_SCHEMA_VERSION), nonce, body, cipher.getAuthTag()]);
}

function open(key: Uint8Array, frame: Uint8Array, aad: Buffer, exactLength?: number): Buffer {
  const bytes = Buffer.from(frame);
  const tooShort = bytes.length < HEADER_BYTES + 1 + TAG_BYTES;
  if (
    tooShort ||
    (exactLength !== undefined && bytes.length !== exactLength) ||
    bytes[0] !== TOKEN_VAULT_SCHEMA_VERSION
  ) {
    throw new TokenVaultError("TOKEN_DECRYPT_FAILED");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(1, HEADER_BYTES), {
      authTagLength: TAG_BYTES,
    });
    decipher.setAAD(aad);
    decipher.setAuthTag(bytes.subarray(bytes.length - TAG_BYTES));
    return Buffer.concat([
      decipher.update(bytes.subarray(HEADER_BYTES, bytes.length - TAG_BYTES)),
      decipher.final(),
    ]);
  } catch {
    // Never chain the cause: OpenSSL messages are generic, but nothing from the frame may surface.
    throw new TokenVaultError("TOKEN_DECRYPT_FAILED");
  }
}

/**
 * Single decryption gateway (ADR-0004 item 5). Built from the strictly parsed key ring; with a `null` ring
 * (development without a key) it refuses every operation instead of falling back.
 */
export class TokenVault {
  readonly #ring: EncryptionKeyRing | null;

  constructor(ring: EncryptionKeyRing | null) {
    this.#ring = ring;
  }

  /** Seals a new credential under a fresh DEK wrapped with the active KEK. */
  seal(
    ref: CredentialRef,
    tokens: { accessToken: string; refreshToken?: string | null },
  ): SealedCredential {
    const ring = this.#requireRing();
    const kek = ring.keys.get(ring.activeVersion);
    if (!kek) throw new TokenVaultError("VAULT_UNAVAILABLE");
    const dek = randomBytes(DEK_BYTES);
    try {
      return {
        accessTokenCiphertext: seal(
          dek,
          Buffer.from(tokens.accessToken, "utf8"),
          canonicalAad(ref, "access"),
        ),
        refreshTokenCiphertext: tokens.refreshToken
          ? seal(dek, Buffer.from(tokens.refreshToken, "utf8"), canonicalAad(ref, "refresh"))
          : null,
        wrappedDek: seal(kek, dek, canonicalAad(ref, "dek")),
        keyVersion: String(ring.activeVersion),
      };
    } finally {
      dek.fill(0);
    }
  }

  /** Decrypts the access token only for the duration of `fn`; the plaintext never leaves the callback. */
  async withAccessToken<T>(
    ref: CredentialRef,
    sealed: SealedCredential,
    fn: (accessToken: string) => Promise<T>,
  ): Promise<T> {
    return fn(this.#open(ref, sealed, "access"));
  }

  #open(ref: CredentialRef, sealed: SealedCredential, tokenType: VaultTokenType): string {
    const ring = this.#requireRing();
    // Strict version lookup: no fallback to the active or newest key (ADR-0004 item 13a).
    const version = /^[1-9]\d*$/.test(sealed.keyVersion) ? Number(sealed.keyVersion) : Number.NaN;
    const kek = ring.keys.get(version);
    if (!kek) throw new TokenVaultError("TOKEN_DECRYPT_FAILED");
    const frame =
      tokenType === "access" ? sealed.accessTokenCiphertext : sealed.refreshTokenCiphertext;
    if (!frame) throw new TokenVaultError("TOKEN_DECRYPT_FAILED");
    const dek = open(kek, sealed.wrappedDek, canonicalAad(ref, "dek"), WRAPPED_DEK_FRAME_BYTES);
    try {
      return open(dek, frame, canonicalAad(ref, tokenType)).toString("utf8");
    } finally {
      dek.fill(0);
    }
  }

  #requireRing(): EncryptionKeyRing {
    if (!this.#ring) throw new TokenVaultError("VAULT_UNAVAILABLE");
    return this.#ring;
  }
}
