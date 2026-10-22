import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(import.meta.dirname, "..", "src");
const IMPORT = /(?:^|\n)\s*(?:import|export)\s[^;]*?\sfrom\s+["']([^"']+)["']/g;

function listTs(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? listTs(full) : full.endsWith(".ts") ? [full] : [];
  });
}

describe("editorial-engine is pure (ADR-0005 §1, §8)", () => {
  const files = listTs(SRC);

  it("imports only zod, contracts or relative modules", () => {
    const violations = files.flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(IMPORT)]
        .map((match) => match[1] as string)
        .filter((s) => !(s === "zod" || s === "@linkedin-ops/contracts" || s.startsWith(".")))
        .map((s) => `${relative(SRC, file)} imports ${s}`),
    );
    expect(violations).toEqual([]);
  });

  it("performs no I/O and reads no environment, clock or randomness", () => {
    for (const file of files) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(
        /process\.env|fetch\(|require\(|from ["']node:|Date\.now\(|new Date\(|Math\.random\(|console\./,
      );
    }
  });
});
