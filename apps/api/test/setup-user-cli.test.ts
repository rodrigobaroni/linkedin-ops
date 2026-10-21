import { spawn } from "node:child_process";
import { createServer, type AddressInfo, type Server } from "node:net";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TSX_BIN = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));
const CLI = fileURLToPath(new URL("../src/cli/setup-user.ts", import.meta.url));
const PASSWORD = "piped password that must never be read";

/** Runs the real entrypoint with piped (non-TTY) stdin and returns exit code and output. */
function runCli(env: Record<string, string>, args: string[] = []) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(TSX_BIN, [CLI, ...args], {
      env: { PATH: process.env["PATH"] ?? "", ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(`x@example.test\nX\n${PASSWORD}\n${PASSWORD}\n`);
  });
}

describe("pnpm setup:user entrypoint without a TTY (Sentinela condition 6)", () => {
  // Stands in for PostgreSQL: any connection the CLI opened would be counted here.
  let server: Server;
  let connections = 0;
  let databaseUrl: string;

  beforeAll(async () => {
    server = createServer((socket) => {
      connections += 1;
      socket.destroy();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    databaseUrl = `postgresql://setup:secret-db-pass@127.0.0.1:${port}/never`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it("exits 1 before prompting for the password or touching the database", async () => {
    const result = await runCli({ DATABASE_URL: databaseUrl }, ["--email", "x@example.test"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("needs an interactive terminal");
    expect(result.stdout).not.toMatch(/Senha|Creating the OWNER/);
    expect(connections).toBe(0);
    const output = result.stdout + result.stderr;
    expect(output).not.toContain(PASSWORD);
    expect(output).not.toContain("secret-db-pass");
  }, 30_000);

  it("also refuses without DATABASE_URL (the TTY check comes first, nothing else runs)", async () => {
    const result = await runCli({});
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("needs an interactive terminal");
  }, 30_000);
});
