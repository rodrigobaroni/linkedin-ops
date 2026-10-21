import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

export interface CreatePrismaClientOptions {
  /** PostgreSQL connection string (`DATABASE_URL`). Never log it: it carries the password. */
  connectionString: string;
  /** Pool size for the pg driver adapter. Default: pg's own default (10). */
  maxConnections?: number;
}

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
    ...(maxConnections === undefined ? {} : { max: maxConnections }),
  });
  return new PrismaClient({ adapter });
}

export type { PrismaClient };
