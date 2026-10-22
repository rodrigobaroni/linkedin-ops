/**
 * ADR-0008 §2: the job-page fetcher is anonymous by construction. Its whole import graph may only reach Node,
 * `parse5`, Pino types and an allow-list of `@linkedin-ops/domain` names (the guard port and the domain helpers):
 * never the LinkedIn API adapter, the token vault, the session modules, Prisma or the environment.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
const ENTRY = resolve(SRC, "career/http-job-page-fetcher.ts");

const ALLOWED_PACKAGES = new Set(["parse5", "pino", "@linkedin-ops/domain"]);
const ALLOWED_DOMAIN_NAMES = new Set([
  "FetchDomainGuard",
  "FetchSlot",
  "FetchStopSignal",
  "JOB_FETCH_LINKEDIN_DOMAIN",
  "fetchDomainPolicy",
  "jobFetchGroupId",
]);

interface ImportRecord {
  file: string;
  specifier: string;
  names: string[];
}

function importsOf(file: string): ImportRecord[] {
  const source = readFileSync(file, "utf8");
  const records: ImportRecord[] = [];
  const pattern = /(?:import|export)\s+(type\s+)?(?:([\s\S]*?)\s+from\s+)?["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) {
    const clause = match[2] ?? "";
    const names = [
      ...clause
        .replace(/[{}]/g, " ")
        .matchAll(/(?:type\s+)?([A-Za-z_$][\w$]*)(?:\s+as\s+[\w$]+)?/g),
    ]
      .map((m) => m[1] as string)
      .filter((name) => name !== "type" && name !== "as");
    records.push({ file, specifier: match[3] as string, names });
  }
  if (/\bimport\s*\(/.test(source))
    records.push({ file, specifier: "<dynamic import>", names: [] });
  return records;
}

function graph(entry: string): { files: string[]; imports: ImportRecord[] } {
  const files: string[] = [];
  const imports: ImportRecord[] = [];
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift() as string;
    if (files.includes(file)) continue;
    files.push(file);
    for (const record of importsOf(file)) {
      if (record.specifier.startsWith(".")) {
        queue.push(resolve(dirname(file), record.specifier.replace(/\.js$/, ".ts")));
      } else {
        imports.push(record);
      }
    }
  }
  return { files, imports };
}

describe("job-page fetcher architecture (ADR-0008 §2)", () => {
  const { files, imports } = graph(ENTRY);

  it("covers the fetcher, the policy, the extractor and the HTTP client", () => {
    const relative = files.map((file) => file.slice(SRC.length + 1)).sort();
    expect(relative).toEqual(
      expect.arrayContaining([
        "career/http-job-page-fetcher.ts",
        "career/job-fetch-policy.ts",
        "career/job-page-text.ts",
        "career/ports.ts",
        "http/address-policy.ts",
        "http/safe-http-client.ts",
      ]),
    );
    // Nothing else in the worker (handlers, LLM client, runner, wiring) is reachable from the fetcher.
    expect(relative.every((file) => file.startsWith("http/") || file.startsWith("career/"))).toBe(
      true,
    );
    expect(relative).not.toContain("career/handlers.ts");
    expect(relative).not.toContain("career/wiring.ts");
    expect(relative).not.toContain("llm/openai.ts");
  });

  it("imports only Node, parse5, Pino and the allowed domain names", () => {
    for (const record of imports) {
      const allowed =
        record.specifier.startsWith("node:") || ALLOWED_PACKAGES.has(record.specifier);
      expect(allowed, `${record.file}: ${record.specifier}`).toBe(true);
      if (record.specifier === "@linkedin-ops/domain") {
        for (const name of record.names) {
          expect(ALLOWED_DOMAIN_NAMES.has(name), `${record.file}: ${name}`).toBe(true);
        }
      }
    }
  });

  it("never reads the environment, a vault, a session or the LinkedIn API", () => {
    for (const file of files) {
      const source = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, "");
      expect(source, file).not.toMatch(
        /process\.env|TokenVault|token-vault|Session|Prisma|linkedin\.client|api\.linkedin\.com/,
      );
    }
  });
});
