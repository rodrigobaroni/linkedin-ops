import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(import.meta.dirname, "..", "src");

function listTs(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? listTs(full) : full.endsWith(".ts") ? [full] : [];
  });
}

const IMPORT = /(?:^|\n)\s*(?:import|export)\s[^;]*?\sfrom\s+["']([^"']+)["']/g;

describe("package boundaries (contracts.md §6: zod only, no I/O, no framework)", () => {
  const files = listTs(SRC);

  it("source files only import zod or relative modules", () => {
    const violations: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      for (const match of content.matchAll(IMPORT)) {
        const specifier = match[1] as string;
        if (specifier === "zod" || specifier.startsWith("./") || specifier.startsWith("../"))
          continue;
        violations.push(`${relative(SRC, file)} imports ${specifier}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("relative imports use explicit .js extensions (NodeNext ESM)", () => {
    const violations: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      for (const match of content.matchAll(IMPORT)) {
        const specifier = match[1] as string;
        if (specifier.startsWith(".") && !specifier.endsWith(".js"))
          violations.push(`${relative(SRC, file)} imports ${specifier}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("does not read the environment or perform I/O", () => {
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      expect(content, file).not.toMatch(/process\.env|fetch\(|require\(|from ["']node:/);
    }
  });
});
