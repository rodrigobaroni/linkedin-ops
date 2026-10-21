import { describe, expect, it } from "vitest";
import {
  assertDatabaseScriptAllowed,
  describeDatabaseTarget,
  isDatabaseScriptEnvironment,
  requireDatabaseUrl,
} from "../src/env/guards.js";

describe("assertDatabaseScriptAllowed", () => {
  it.each([undefined, "", "production", "staging", "prod", "Development", "TEST"])(
    "refuses db:seed and db:reset when NODE_ENV is %j",
    (nodeEnv) => {
      const env = { NODE_ENV: nodeEnv, DB_RESET_CONFIRM: "1" };
      expect(() => assertDatabaseScriptAllowed(env, "seed")).toThrow(/NODE_ENV must be one of/);
      expect(() => assertDatabaseScriptAllowed(env, "reset")).toThrow(/NODE_ENV must be one of/);
    },
  );

  it.each(["development", "test"])("allows db:seed when NODE_ENV=%s", (nodeEnv) => {
    expect(() => assertDatabaseScriptAllowed({ NODE_ENV: nodeEnv }, "seed")).not.toThrow();
  });

  it("db:reset also needs DB_RESET_CONFIRM=1", () => {
    expect(() => assertDatabaseScriptAllowed({ NODE_ENV: "development" }, "reset")).toThrow(
      /DB_RESET_CONFIRM=1/,
    );
    expect(() =>
      assertDatabaseScriptAllowed({ NODE_ENV: "development", DB_RESET_CONFIRM: "true" }, "reset"),
    ).toThrow(/DB_RESET_CONFIRM=1/);
    expect(() =>
      assertDatabaseScriptAllowed({ NODE_ENV: "test", DB_RESET_CONFIRM: "1" }, "reset"),
    ).not.toThrow();
  });

  it("never echoes other variables in the error", () => {
    const env = { NODE_ENV: "production", DATABASE_URL: "postgresql://u:supersecret@h/db" };
    let message = "";
    try {
      assertDatabaseScriptAllowed(env, "seed");
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toContain("supersecret");
  });
});

describe("isDatabaseScriptEnvironment", () => {
  it("accepts only the allowlist", () => {
    expect(isDatabaseScriptEnvironment("development")).toBe(true);
    expect(isDatabaseScriptEnvironment("test")).toBe(true);
    expect(isDatabaseScriptEnvironment("production")).toBe(false);
    expect(isDatabaseScriptEnvironment(undefined)).toBe(false);
  });
});

describe("requireDatabaseUrl / describeDatabaseTarget", () => {
  it("throws when DATABASE_URL is missing or empty", () => {
    expect(() => requireDatabaseUrl({})).toThrow(/DATABASE_URL is not set/);
    expect(() => requireDatabaseUrl({ DATABASE_URL: "" })).toThrow(/DATABASE_URL is not set/);
  });

  it("returns the url and describes the target without credentials", () => {
    const url = "postgresql://user:s3cret@db.internal:5433/linkedin_ops?schema=public";
    expect(requireDatabaseUrl({ DATABASE_URL: url })).toBe(url);
    const target = describeDatabaseTarget(url);
    expect(target).toBe("db.internal:5433/linkedin_ops");
    expect(target).not.toContain("s3cret");
    expect(describeDatabaseTarget("postgresql://u:p@localhost/db")).toBe("localhost:5432/db");
  });
});
