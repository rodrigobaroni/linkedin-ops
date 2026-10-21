import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  TOKEN_VAULT_SCHEMA_VERSION,
  TokenVault,
  TokenVaultError,
  type CredentialRef,
  type SealedCredential,
} from "../src/crypto/token-vault.js";
import type { EncryptionKeyRing } from "../src/env/runtime.js";

// Evidence for gate G-02 (ADR-0004 Consequences, Sentinela condition 4): round-trip, distinct nonces,
// and fail-closed decryption on any tampering of ciphertext, tag, AAD, wrapped DEK, key or frame length.

const ACCESS = "AQX-access-token-plaintext-for-tests";
const REFRESH = "AQX-refresh-token-plaintext-for-tests";
const REF: CredentialRef = {
  provider: "linkedin",
  userId: "0b6f6c4e-3f1a-4d36-9a52-5d2f5a1e7c01",
  credentialId: "6a0e2a7b-0d55-4a8b-8c4b-0a4f0f8d9e12",
};

const ring = (key: Uint8Array = randomBytes(32), version = 1): EncryptionKeyRing => ({
  activeVersion: version,
  keys: new Map([[version, key]]),
});

const reveal = (vault: TokenVault, sealed: SealedCredential, ref: CredentialRef = REF) =>
  vault.withAccessToken(ref, sealed, async (token) => token);

const flip = (frame: Uint8Array, index: number): Uint8Array => {
  const copy = Buffer.from(frame);
  const at = index < 0 ? copy.length + index : index;
  copy[at] = (copy[at] ?? 0) ^ 0x01;
  return copy;
};

const expectDecryptFailure = async (promise: Promise<unknown>) => {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(TokenVaultError);
  expect((error as TokenVaultError).code).toBe("TOKEN_DECRYPT_FAILED");
  expect((error as Error).message).not.toContain(ACCESS);
  expect((error as Error).cause).toBeUndefined();
};

describe("TokenVault", () => {
  const keyRing = ring();
  const vault = new TokenVault(keyRing);
  const sealed = vault.seal(REF, { accessToken: ACCESS, refreshToken: REFRESH });

  it("round-trips the access token and persists only the envelope columns", async () => {
    await expect(reveal(vault, sealed)).resolves.toBe(ACCESS);
    expect(sealed.keyVersion).toBe("1");
    expect(Object.keys(sealed).sort()).toEqual(
      ["accessTokenCiphertext", "keyVersion", "refreshTokenCiphertext", "wrappedDek"].sort(),
    );
    for (const frame of [
      sealed.accessTokenCiphertext,
      sealed.refreshTokenCiphertext!,
      sealed.wrappedDek,
    ]) {
      expect(frame[0]).toBe(TOKEN_VAULT_SCHEMA_VERSION);
      expect(Buffer.from(frame).toString("utf8")).not.toContain("token-plaintext");
    }
    expect(sealed.wrappedDek.length).toBe(1 + 12 + 32 + 16);
    expect(sealed.accessTokenCiphertext.length).toBe(1 + 12 + Buffer.byteLength(ACCESS) + 16);
  });

  it("uses distinct nonces per frame and a fresh DEK per credential", () => {
    const nonce = (frame: Uint8Array) => Buffer.from(frame.subarray(1, 13)).toString("hex");
    const nonces = [
      sealed.accessTokenCiphertext,
      sealed.refreshTokenCiphertext!,
      sealed.wrappedDek,
    ].map(nonce);
    expect(new Set(nonces).size).toBe(3);

    const again = vault.seal(REF, { accessToken: ACCESS });
    expect(Buffer.compare(again.wrappedDek, sealed.wrappedDek)).not.toBe(0);
    expect(Buffer.compare(again.accessTokenCiphertext, sealed.accessTokenCiphertext)).not.toBe(0);
    expect(again.refreshTokenCiphertext).toBeNull();
  });

  it("fails closed on tampered ciphertext, tag, nonce or schema version of the token frame", async () => {
    for (const index of [13, -1, 1, 0]) {
      await expectDecryptFailure(
        reveal(vault, {
          ...sealed,
          accessTokenCiphertext: flip(sealed.accessTokenCiphertext, index),
        }),
      );
    }
  });

  it("fails closed on a tampered or foreign wrapped DEK", async () => {
    for (const index of [13, -1, 1, 0]) {
      await expectDecryptFailure(
        reveal(vault, { ...sealed, wrappedDek: flip(sealed.wrappedDek, index) }),
      );
    }
    const other = vault.seal(REF, { accessToken: ACCESS });
    await expectDecryptFailure(reveal(vault, { ...sealed, wrappedDek: other.wrappedDek }));
  });

  it("fails closed when the AAD does not match (other user, credential or token type)", async () => {
    await expectDecryptFailure(
      reveal(vault, sealed, { ...REF, userId: "1b6f6c4e-3f1a-4d36-9a52-5d2f5a1e7c01" }),
    );
    await expectDecryptFailure(
      reveal(vault, sealed, { ...REF, credentialId: "7a0e2a7b-0d55-4a8b-8c4b-0a4f0f8d9e12" }),
    );
    // The refresh frame shares the DEK but is bound to tokenType=refresh.
    await expectDecryptFailure(
      reveal(vault, { ...sealed, accessTokenCiphertext: sealed.refreshTokenCiphertext! }),
    );
  });

  it("fails closed with a wrong KEK or an unknown key version, without falling back", async () => {
    await expectDecryptFailure(reveal(new TokenVault(ring()), sealed));
    await expectDecryptFailure(reveal(new TokenVault(ring(randomBytes(32), 2)), sealed));
    for (const keyVersion of ["2", "01", "1 ", "", "abc"]) {
      await expectDecryptFailure(reveal(vault, { ...sealed, keyVersion }));
    }
  });

  it("fails closed on truncated or extended frames", async () => {
    const access = Buffer.from(sealed.accessTokenCiphertext);
    const wrapped = Buffer.from(sealed.wrappedDek);
    for (const accessTokenCiphertext of [
      access.subarray(0, 0),
      access.subarray(0, 29),
      access.subarray(0, -1),
    ]) {
      await expectDecryptFailure(reveal(vault, { ...sealed, accessTokenCiphertext }));
    }
    for (const wrappedDek of [
      wrapped.subarray(0, 12),
      wrapped.subarray(0, -1),
      Buffer.concat([wrapped, Buffer.of(0)]),
    ]) {
      await expectDecryptFailure(reveal(vault, { ...sealed, wrappedDek }));
    }
  });

  it("refuses to operate without a key ring and rejects non-canonical references", async () => {
    const disabled = new TokenVault(null);
    expect(() => disabled.seal(REF, { accessToken: ACCESS })).toThrow(
      expect.objectContaining({ code: "VAULT_UNAVAILABLE" }),
    );
    await expect(reveal(disabled, sealed)).rejects.toMatchObject({ code: "VAULT_UNAVAILABLE" });
    expect(() => vault.seal({ ...REF, userId: "user|1" }, { accessToken: ACCESS })).toThrow(
      expect.objectContaining({ code: "INVALID_CREDENTIAL_REF" }),
    );
  });
});
