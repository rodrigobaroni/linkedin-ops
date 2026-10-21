import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

export interface CreatePrismaClientOptions {
  /** PostgreSQL connection string (`DATABASE_URL`). Never log it: it carries the password. */
  connectionString: string;
  /** Pool size for the pg driver adapter. Default: pg's own default (10). */
  maxConnections?: number;
}

/**
 * Every pooled connection runs with `TimeZone=UTC`. `@prisma/adapter-pg` sends `timestamptz` parameters
 * without an offset, so PostgreSQL reads them in the session time zone: with a non-UTC server/database
 * default (e.g. America/Sao_Paulo) every written instant would shift by the offset and SQL `now()` would
 * disagree with the application clock (finding by Pêndulo, T-015).
 */
export const SESSION_TIME_ZONE_OPTIONS = "-c TimeZone=UTC";

/**
 * Builds the Prisma Client on top of the `pg` driver adapter (Prisma 7 has no bundled engine).
 * Callers own the lifecycle: `await client.$disconnect()` on shutdown.
 */
export function createPrismaClient({
  connectionString,
  maxConnections,
}: CreatePrismaClientOptions): PrismaClient {
  const adapter = new PrismaPg({
    connectionString,
    options: SESSION_TIME_ZONE_OPTIONS,
    ...(maxConnections === undefined ? {} : { max: maxConnections }),
  });
  return new PrismaClient({ adapter });
}

export type { PrismaClient };
