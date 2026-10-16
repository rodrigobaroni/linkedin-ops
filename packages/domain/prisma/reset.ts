/**
 * `pnpm db:reset`: drop and recreate the database schema, re-apply every migration and run the seed
 * (`prisma migrate reset --force`, seed command from prisma.config.ts). Development/test only.
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if (process.env["NODE_ENV"] === "production") {
  throw new Error("Refusing to reset: NODE_ENV=production");
}
const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}
const target = new URL(connectionString);
// Host and database only; never the credentials.
console.warn(`db:reset → ${target.hostname}:${target.port || "5432"}${target.pathname}`);

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
execFileSync("pnpm", ["exec", "prisma", "migrate", "reset", "--force"], {
  cwd: packageRoot,
  stdio: "inherit",
});
