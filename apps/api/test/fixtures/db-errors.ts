/** Errors shaped like Prisma 7 + adapter-pg and pg ones, carrying a canary where the real ones carry row data. */
export const ROW_CANARY = "CANARIO-LINHA-0102";

export class PrismaClientKnownRequestError extends Error {
  readonly code = "P2010";
  readonly meta = {
    driverAdapterError: {
      cause: {
        originalCode: "23514",
        detail: `Failing row contains (https://x.example/${ROW_CANARY}).`,
      },
    },
  };

  constructor() {
    super(
      `Invalid \`tx.jobPosting.create()\` invocation:\n\nnew row violates check constraint "x". Failing row contains (${ROW_CANARY}).`,
    );
    this.name = "PrismaClientKnownRequestError";
  }
}

/** pg's `DatabaseError`: the row in `detail`, the key values in the message of a unique violation. */
export class DatabaseError extends Error {
  readonly code = "23505";
  readonly detail = `Key (email)=(${ROW_CANARY}@example.test) already exists.`;
  readonly table = "users";

  constructor() {
    super(
      `duplicate key value violates unique constraint "users_email_key"\nDETAIL: Key (email)=(${ROW_CANARY}@example.test) already exists.`,
    );
    this.name = "DatabaseError";
  }
}
