/**
 * Guards for the database scripts (`db:seed`, `db:reset`). They run with full DDL/DML power, so they
 * are allowed only where data is disposable: an explicit allowlist of NODE_ENV values (an unset
 * NODE_ENV is refused, not assumed to be development) plus a second opt-in for `db:reset`.
 */
export const DATABASE_SCRIPT_ENVIRONMENTS = ["development", "test"] as const;
export type DatabaseScriptEnvironment = (typeof DATABASE_SCRIPT_ENVIRONMENTS)[number];

export const DB_RESET_CONFIRM_VARIABLE = "DB_RESET_CONFIRM";

export type DatabaseScript = "seed" | "reset";

/** Subset of `process.env` the guards read; passed explicitly so tests never mutate the real env. */
export type EnvironmentLike = Readonly<Record<string, string | undefined>>;

export function isDatabaseScriptEnvironment(
  value: string | undefined,
): value is DatabaseScriptEnvironment {
  return (DATABASE_SCRIPT_ENVIRONMENTS as readonly string[]).includes(value ?? "");
}

/**
 * Throws unless `NODE_ENV` is in the allowlist and, for `reset`, `DB_RESET_CONFIRM=1` is present.
 * Never echoes any other variable (no connection string, no password) in the error message.
 */
export function assertDatabaseScriptAllowed(env: EnvironmentLike, script: DatabaseScript): void {
  const nodeEnv = env["NODE_ENV"];
  if (!isDatabaseScriptEnvironment(nodeEnv)) {
    throw new Error(
      `Refusing to run db:${script}: NODE_ENV must be one of ${DATABASE_SCRIPT_ENVIRONMENTS.join(", ")} ` +
        `(got ${nodeEnv === undefined || nodeEnv === "" ? "unset" : JSON.stringify(nodeEnv)})`,
    );
  }
  if (script === "reset" && env[DB_RESET_CONFIRM_VARIABLE] !== "1") {
    throw new Error(
      `Refusing to run db:reset: it drops every table. Set ${DB_RESET_CONFIRM_VARIABLE}=1 to confirm.`,
    );
  }
}

/** Returns `DATABASE_URL` or throws; the value itself is never included in the error. */
export function requireDatabaseUrl(env: EnvironmentLike): string {
  const url = env["DATABASE_URL"];
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return url;
}

/** `host:port/database` for operator-facing output. Credentials and query string are dropped. */
export function describeDatabaseTarget(connectionString: string): string {
  const url = new URL(connectionString);
  const port = url.port === "" ? "5432" : url.port;
  return `${url.hostname}:${port}${url.pathname}`;
}
