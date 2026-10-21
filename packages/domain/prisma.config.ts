import { defineConfig } from "prisma/config";

/**
 * `generate`, `validate` and `migrate diff --from-empty` never open a connection, so a missing
 * DATABASE_URL must not break them (CI lint/typecheck/build run without a database). Commands that do
 * connect fail loudly with the placeholder host name instead of a vague "undefined" error.
 */
const DATABASE_URL =
  process.env["DATABASE_URL"] ?? "postgresql://unset:unset@database-url-not-set.invalid:5432/unset";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: DATABASE_URL,
  },
});
