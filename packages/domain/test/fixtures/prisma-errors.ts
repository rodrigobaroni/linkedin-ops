/** Errors shaped like Prisma 7 + adapter-pg ones, carrying a canary where the real ones carry row data. */
export const ROW_CANARY = "CANARIO-LINHA-0000";

export class PrismaClientKnownRequestError extends Error {
  readonly code = "P2010";
  readonly clientVersion = "7.10.1";
  readonly meta = {
    modelName: "JobPosting",
    driverAdapterError: {
      name: "DriverAdapterError",
      cause: {
        originalCode: "23514",
        kind: "postgres",
        detail: `Failing row contains (0192, https://acme.example/${ROW_CANARY}, user-1).`,
      },
    },
  };

  constructor() {
    super(
      [
        "",
        "Invalid `tx.jobPosting.create()` invocation in",
        "/app/packages/domain/src/career/job-postings.ts:212:42",
        "",
        "  209       for (const [urlHash, url] of distinct) {",
        "→ 212         const row = await tx.jobPosting.create(",
        `new row for relation "job_postings" violates check constraint "job_postings_url_check". Failing row contains (0192, https://acme.example/${ROW_CANARY}).`,
      ].join("\n"),
    );
    this.name = "PrismaClientKnownRequestError";
  }
}

export class PrismaClientValidationError extends Error {
  constructor() {
    super(
      `Invalid \`prisma.user.create()\` invocation:\n{ data: { email: "${ROW_CANARY}@example.test" } }`,
    );
    this.name = "PrismaClientValidationError";
  }
}

/** pg's `DatabaseError`: the row is in `detail`, the key values in the message of a unique violation. */
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
