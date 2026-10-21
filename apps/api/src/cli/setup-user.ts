/**
 * `pnpm setup:user` — creates the first and only OWNER (T-015). There is no HTTP equivalent.
 *
 *   pnpm setup:user [--email rodrigo@example.com] [--name "Rodrigo"]
 *   # production image: docker compose run --rm -it api node apps/api/dist/cli/setup-user.js
 *
 * The password is read from the terminal without echo, twice, and never accepted from arguments or
 * environment variables (Sentinela, condition 6). Refuses when an OWNER already exists or when stdin is
 * not a TTY. Output never includes the password or the database credentials.
 */
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { parseArgs } from "node:util";
import {
  createFirstOwner,
  createPrismaClient,
  describeDatabaseTarget,
  requireDatabaseUrl,
  SetupUserError,
} from "@linkedin-ops/domain";

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

/** Reads one line with echo off: readline writes the typed characters to a sink instead of the TTY. */
async function askHidden(question: string): Promise<string> {
  const sink = new Writable({ write: (_chunk, _encoding, callback) => callback() });
  process.stdout.write(question);
  const rl = createInterface({ input: process.stdin, output: sink, terminal: true });
  try {
    return await rl.question("");
  } finally {
    rl.close();
    process.stdout.write("\n");
  }
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: { email: { type: "string" }, name: { type: "string" } },
    strict: true,
  });
  if (!process.stdin.isTTY) {
    console.error("setup:user needs an interactive terminal (the password is typed, never piped).");
    return 1;
  }

  const databaseUrl = requireDatabaseUrl(process.env);
  process.stdout.write(`Creating the OWNER in ${describeDatabaseTarget(databaseUrl)}\n`);
  const email = values.email ?? (await ask("E-mail: "));
  const name = values.name ?? (await ask("Nome: "));
  const password = await askHidden("Senha (mín. 15 caracteres, sem eco): ");
  const confirmation = await askHidden("Confirme a senha: ");
  if (password !== confirmation) {
    console.error("As senhas não conferem. Nada foi criado.");
    return 1;
  }

  const prisma = createPrismaClient({ connectionString: databaseUrl, maxConnections: 1 });
  try {
    const user = await createFirstOwner(prisma, { email, name, password });
    process.stdout.write(`OWNER criado: ${user.email} (${user.id})\n`);
    return 0;
  } catch (error) {
    if (error instanceof SetupUserError) {
      console.error(`Recusado: ${error.message}. Nada foi criado.`);
      return 1;
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    // Never print the error object itself (stack, driver metadata); strip any connection string.
    const message = error instanceof Error ? `${error.name}: ${error.message}` : "unknown error";
    console.error(
      `setup:user failed: ${message.replaceAll(/postgres(ql)?:\/\/\S+/g, "[DATABASE_URL]")}`,
    );
    process.exit(1);
  },
);
