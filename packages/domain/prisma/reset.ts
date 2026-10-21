/**
 * `pnpm db:reset`: drop and recreate the database schema, re-apply every migration and run the seed
 * (`prisma migrate reset --force`, seed command from prisma.config.ts). Development/test only:
 * NODE_ENV ∈ {development, test} AND DB_RESET_CONFIRM=1 (`src/env/guards.ts`).
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  assertDatabaseScriptAllowed,
  describeDatabaseTarget,
  requireDatabaseUrl,
} from "../src/env/guards.js";

assertDatabaseScriptAllowed(process.env, "reset");
const connectionString = requireDatabaseUrl(process.env);
// Host, port and database only; never the credentials.
console.warn(`db:reset → ${describeDatabaseTarget(connectionString)}`);

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
execFileSync("pnpm", ["exec", "prisma", "migrate", "reset", "--force"], {
  cwd: packageRoot,
  stdio: "inherit",
});
