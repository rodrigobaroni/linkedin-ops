import type { PrismaClient } from "../client.js";

export type Transaction = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/**
 * Runs one SQL statement on the caller's connection. The career repositories hand their transaction to the
 * enqueue callbacks through this shape, which is what pg-boss accepts as `send(..., { db })`: the job row
 * commits or rolls back with the state change (ADR-0002 §3). The domain never depends on pg-boss itself.
 */
export interface SqlExecutor {
  executeSql(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

/** Lets a statement built elsewhere (pg-boss) run inside a Prisma interactive transaction. */
export function sqlExecutor(tx: Transaction): SqlExecutor {
  return {
    executeSql: async (text, values = []) => ({
      rows: await tx.$queryRawUnsafe<unknown[]>(text, ...values),
    }),
  };
}

/** Serializes career writes of one owner (row lock on `users`, released at commit). */
export async function lockOwner(tx: Transaction, userId: string): Promise<void> {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "users" WHERE "id" = ${userId}::uuid FOR UPDATE`;
  if (locked.length === 0) throw new Error("Career data owner does not exist");
}
