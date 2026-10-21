import { describe, expect, it } from "vitest";
import { ARGON2ID_PARAMETERS, hashPassword, verifyPassword } from "../src/auth/password.js";

describe("hashPassword / verifyPassword", () => {
  it("produces an Argon2id hash with the configured parameters and verifies it", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    // PHC string: $argon2id$v=19$m=<memory>,t=<iterations>,p=<lanes>$<salt>$<hash> (parameter order
    // is not guaranteed, so parse the segment instead of matching a literal).
    const parameters = Object.fromEntries(
      (hash.split("$")[3] ?? "").split(",").map((pair) => pair.split("=") as [string, string]),
    );
    expect(parameters).toEqual({
      m: String(ARGON2ID_PARAMETERS.memoryCost),
      t: String(ARGON2ID_PARAMETERS.timeCost),
      p: String(ARGON2ID_PARAMETERS.parallelism),
    });
    expect(hash).not.toContain("correct horse");
    await expect(verifyPassword(hash, "correct horse battery staple")).resolves.toBe(true);
  });

  it("rejects a wrong password and a malformed hash without throwing", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(verifyPassword(hash, "wrong password entirely")).resolves.toBe(false);
    await expect(verifyPassword("not-a-hash", "whatever")).resolves.toBe(false);
  });

  it("salts every hash (two hashes of the same password differ)", async () => {
    const [a, b] = await Promise.all([
      hashPassword("same password here"),
      hashPassword("same password here"),
    ]);
    expect(a).not.toBe(b);
  });
});
