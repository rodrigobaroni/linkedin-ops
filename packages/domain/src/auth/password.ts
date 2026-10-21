import argon2 from "argon2";

/**
 * Argon2id parameters (ADR-0007 §1): OWASP minimum of 19 MiB memory, 2 iterations, 1 lane. Calibrated
 * against the production host in T-015; raising them only affects new hashes (argon2 encodes the
 * parameters in the hash string), so existing rows keep verifying.
 */
export const ARGON2ID_PARAMETERS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/** Hashes a password with Argon2id. The result is safe to persist in `users.password_hash`. */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2ID_PARAMETERS);
}

/** Constant-time verification; `false` for a wrong password or a malformed hash, never throws on those. */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
