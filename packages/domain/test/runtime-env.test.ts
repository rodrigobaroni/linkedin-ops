import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decodeEncryptionKey,
  RuntimeEnvError,
  validateRuntimeEnv,
  validateWorkerEnv,
} from "../src/env/runtime.js";

const KEY_A = randomBytes(32).toString("base64");
const KEY_B = randomBytes(32).toString("base64");
const STRONG_SECRET = randomBytes(48).toString("base64");
const DB_URL = "postgresql://ops:s3cr3t-pass@db.internal:5432/linkedin_ops";

const PRODUCTION = {
  NODE_ENV: "production",
  APP_BASE_URL: "https://ops.example.com",
  DATABASE_URL: DB_URL,
  SESSION_SECRET: STRONG_SECRET,
  ENCRYPTION_KEY: KEY_A,
};

/** `.env.example` as shipped (placeholders), with NODE_ENV overridable. */
const EXAMPLE = {
  NODE_ENV: "development",
  APP_BASE_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://linkedin_ops:change-me@localhost:5432/linkedin_ops",
  SESSION_SECRET: "change-me-generate-a-long-random-string",
  ENCRYPTION_KEY: "change-me-32-bytes-base64-for-token-at-rest-encryption",
};

function issuesOf(env: Record<string, string | undefined>): string[] {
  try {
    validateRuntimeEnv(env);
  } catch (error) {
    if (error instanceof RuntimeEnvError) return [...error.issues];
    throw error;
  }
  return [];
}

describe("validateRuntimeEnv · happy paths", () => {
  it("accepts a complete production environment and normalizes defaults", () => {
    const env = validateRuntimeEnv(PRODUCTION);
    expect(env.nodeEnv).toBe("production");
    expect(env.appBaseUrl).toBe("https://ops.example.com");
    expect(env.apiPort).toBe(3001);
    expect(env.apiHost).toBe("0.0.0.0");
    expect(env.logLevel).toBe("info");
    expect(env.databaseUrl).toBe(DB_URL);
    expect(env.sessionSecret).toBe(STRONG_SECRET);
    expect(env.linkedinPkce).toBeNull();
    expect(env.encryptionKeyRing?.activeVersion).toBe(1);
    expect(env.encryptionKeyRing?.keys.get(1)).toHaveLength(32);
  });

  it("accepts the shipped .env.example in development (placeholders tolerated, ring unconfigured)", () => {
    const env = validateRuntimeEnv(EXAMPLE);
    expect(env.nodeEnv).toBe("development");
    expect(env.apiHost).toBe("127.0.0.1");
    expect(env.encryptionKeyRing).toBeNull();
  });

  it("parses API_PORT, API_HOST, LOG_LEVEL, LINKEDIN_PKCE and a trailing slash on APP_BASE_URL", () => {
    const env = validateRuntimeEnv({
      ...PRODUCTION,
      APP_BASE_URL: "https://ops.example.com/",
      API_PORT: "4010",
      API_HOST: "10.0.0.5",
      LOG_LEVEL: "debug",
      LINKEDIN_PKCE: "required",
    });
    expect(env.appBaseUrl).toBe("https://ops.example.com");
    expect(env.apiPort).toBe(4010);
    expect(env.apiHost).toBe("10.0.0.5");
    expect(env.logLevel).toBe("debug");
    expect(env.linkedinPkce).toBe("required");
  });

  it("parses a multi-version key ring with an explicit active version", () => {
    const env = validateRuntimeEnv({
      ...PRODUCTION,
      ENCRYPTION_KEY: undefined,
      ENCRYPTION_KEYS: `1:${KEY_A}, 2:${KEY_B}`,
      ENCRYPTION_ACTIVE_KEY_VERSION: "2",
    });
    expect(env.encryptionKeyRing?.activeVersion).toBe(2);
    expect([...(env.encryptionKeyRing?.keys.keys() ?? [])]).toEqual([1, 2]);
  });
});

describe("validateRuntimeEnv · fail closed (SEC-004)", () => {
  it("refuses an unset or unknown NODE_ENV instead of assuming development", () => {
    expect(issuesOf({ ...PRODUCTION, NODE_ENV: undefined })).toEqual(
      expect.arrayContaining([expect.stringMatching(/NODE_ENV is not set/)]),
    );
    expect(issuesOf({ ...PRODUCTION, NODE_ENV: "staging" })).toEqual([
      expect.stringMatching(/NODE_ENV must be one of development, test, production/),
    ]);
  });

  it("boot without DATABASE_URL fails with a clear message", () => {
    expect(issuesOf({ ...PRODUCTION, DATABASE_URL: undefined })).toEqual([
      "DATABASE_URL is not set",
    ]);
    expect(issuesOf({ ...PRODUCTION, DATABASE_URL: "   " })).toEqual(["DATABASE_URL is not set"]);
    expect(issuesOf({ ...PRODUCTION, DATABASE_URL: "mysql://a:b@c/d" })).toEqual([
      expect.stringMatching(/postgresql:\/\/ scheme/),
    ]);
  });

  it.each(["production", "test"])(
    "rejects every .env.example placeholder when NODE_ENV=%s",
    (nodeEnv) => {
      const issues = issuesOf({
        ...EXAMPLE,
        NODE_ENV: nodeEnv,
        APP_BASE_URL: "https://ops.example.com",
      });
      expect(issues).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/^DATABASE_URL still contains a change-me placeholder/),
          expect.stringMatching(/^SESSION_SECRET is still the change-me placeholder/),
          expect.stringMatching(
            /^ENCRYPTION_KEY\/ENCRYPTION_KEYS is still the change-me placeholder/,
          ),
        ]),
      );
    },
  );

  it("requires SESSION_SECRET with at least 32 bytes in every environment", () => {
    expect(issuesOf({ ...PRODUCTION, SESSION_SECRET: undefined })).toEqual([
      "SESSION_SECRET is not set",
    ]);
    expect(issuesOf({ ...PRODUCTION, SESSION_SECRET: "x".repeat(31) })).toEqual([
      "SESSION_SECRET must be at least 32 bytes",
    ]);
    expect(issuesOf({ ...EXAMPLE, SESSION_SECRET: "short-dev-secret" })).toEqual([
      "SESSION_SECRET must be at least 32 bytes",
    ]);
    expect(issuesOf({ ...PRODUCTION, SESSION_SECRET: "x".repeat(32) })).toEqual([]);
  });

  it("requires an encryption key outside development", () => {
    expect(issuesOf({ ...PRODUCTION, ENCRYPTION_KEY: undefined })).toEqual([
      "ENCRYPTION_KEY or ENCRYPTION_KEYS must be set outside development",
    ]);
  });

  it("validates APP_BASE_URL as an https origin in production", () => {
    expect(issuesOf({ ...PRODUCTION, APP_BASE_URL: undefined })).toEqual([
      "APP_BASE_URL is not set",
    ]);
    expect(issuesOf({ ...PRODUCTION, APP_BASE_URL: "ops.example.com" })).toEqual([
      "APP_BASE_URL is not a valid absolute URL",
    ]);
    expect(issuesOf({ ...PRODUCTION, APP_BASE_URL: "http://ops.example.com" })).toEqual([
      "APP_BASE_URL must use https in production",
    ]);
    expect(issuesOf({ ...PRODUCTION, APP_BASE_URL: "https://ops.example.com/app" })).toEqual([
      "APP_BASE_URL must be an origin only (no path, query or fragment)",
    ]);
    expect(issuesOf({ ...PRODUCTION, APP_BASE_URL: "https://u:p@ops.example.com" })).toEqual([
      "APP_BASE_URL must not carry credentials",
    ]);
  });

  it("validates API_PORT, LOG_LEVEL and LINKEDIN_PKCE strictly (no silent default on garbage)", () => {
    expect(issuesOf({ ...PRODUCTION, API_PORT: "0" })).toEqual([
      "API_PORT must be an integer between 1 and 65535",
    ]);
    expect(issuesOf({ ...PRODUCTION, API_PORT: "80a" })).toHaveLength(1);
    expect(issuesOf({ ...PRODUCTION, LOG_LEVEL: "verbose" })).toEqual([
      expect.stringMatching(/^LOG_LEVEL must be one of/),
    ]);
    expect(issuesOf({ ...PRODUCTION, LINKEDIN_PKCE: "auto" })).toEqual([
      "LINKEDIN_PKCE must be one of required, disabled",
    ]);
  });

  it("reports every problem at once", () => {
    const issues = issuesOf({ NODE_ENV: "production" });
    expect(issues).toEqual(
      expect.arrayContaining([
        "APP_BASE_URL is not set",
        "DATABASE_URL is not set",
        "SESSION_SECRET is not set",
        "ENCRYPTION_KEY or ENCRYPTION_KEYS must be set outside development",
      ]),
    );
  });

  it("never echoes a value in the error message", () => {
    const marker = "VALUE-THAT-MUST-NOT-LEAK";
    let message = "";
    try {
      validateRuntimeEnv({
        NODE_ENV: "production",
        APP_BASE_URL: `https://u:${marker}@h/`,
        DATABASE_URL: `postgresql://u:${marker}@h/db?x=${marker}`,
        SESSION_SECRET: marker,
        ENCRYPTION_KEY: marker,
        ENCRYPTION_ACTIVE_KEY_VERSION: marker,
        LOG_LEVEL: marker,
        API_PORT: marker,
        LINKEDIN_PKCE: marker,
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/Invalid runtime environment/);
    expect(message).not.toContain(marker);
  });
});

describe("key ring · strict parse without fallback (ADR-0004 item 13(a))", () => {
  const ring = (overrides: Record<string, string | undefined>) =>
    issuesOf({ ...PRODUCTION, ENCRYPTION_KEY: undefined, ...overrides });

  it("rejects ENCRYPTION_KEY that is not canonical base64 of 32 bytes, even in development", () => {
    expect(issuesOf({ ...PRODUCTION, ENCRYPTION_KEY: randomBytes(31).toString("base64") })).toEqual(
      ["ENCRYPTION_KEY must be canonical base64 of exactly 32 bytes"],
    );
    expect(
      issuesOf({ ...PRODUCTION, ENCRYPTION_KEY: randomBytes(33).toString("base64") }),
    ).toHaveLength(1);
    expect(
      issuesOf({ ...PRODUCTION, ENCRYPTION_KEY: randomBytes(32).toString("hex") }),
    ).toHaveLength(1);
    expect(
      issuesOf({ ...PRODUCTION, ENCRYPTION_KEY: randomBytes(32).toString("base64url") }),
    ).toHaveLength(1);
    expect(issuesOf({ ...EXAMPLE, ENCRYPTION_KEY: "not-a-key" })).toEqual([
      "ENCRYPTION_KEY must be canonical base64 of exactly 32 bytes",
    ]);
  });

  it("rejects ENCRYPTION_KEY together with ENCRYPTION_KEYS (ambiguous, no fallback)", () => {
    expect(ring({ ENCRYPTION_KEY: KEY_A, ENCRYPTION_KEYS: `1:${KEY_A}` })).toEqual([
      "ENCRYPTION_KEY and ENCRYPTION_KEYS are both set; configure exactly one (no fallback)",
    ]);
  });

  it("rejects ENCRYPTION_KEY with an active version other than 1", () => {
    expect(ring({ ENCRYPTION_KEY: KEY_A, ENCRYPTION_ACTIVE_KEY_VERSION: "2" })).toEqual([
      "ENCRYPTION_ACTIVE_KEY_VERSION must be unset or 1 when ENCRYPTION_KEY (version 1) is used",
    ]);
    expect(ring({ ENCRYPTION_KEY: KEY_A, ENCRYPTION_ACTIVE_KEY_VERSION: "1" })).toEqual([]);
  });

  it("requires ENCRYPTION_ACTIVE_KEY_VERSION with ENCRYPTION_KEYS (never the newest, never 1)", () => {
    expect(ring({ ENCRYPTION_KEYS: `1:${KEY_A},2:${KEY_B}` })).toEqual([
      "ENCRYPTION_ACTIVE_KEY_VERSION is required when ENCRYPTION_KEYS is set (no fallback)",
    ]);
  });

  it("rejects an active version missing from the ring", () => {
    expect(
      ring({ ENCRYPTION_KEYS: `1:${KEY_A},2:${KEY_B}`, ENCRYPTION_ACTIVE_KEY_VERSION: "3" }),
    ).toEqual(["ENCRYPTION_ACTIVE_KEY_VERSION=3 is not present in ENCRYPTION_KEYS"]);
    expect(ring({ ENCRYPTION_KEYS: `1:${KEY_A}`, ENCRYPTION_ACTIVE_KEY_VERSION: "0" })).toEqual([
      "ENCRYPTION_ACTIVE_KEY_VERSION must be a positive integer",
    ]);
  });

  it("rejects duplicate versions, empty entries and malformed entries", () => {
    expect(
      ring({ ENCRYPTION_KEYS: `1:${KEY_A},1:${KEY_B}`, ENCRYPTION_ACTIVE_KEY_VERSION: "1" }),
    ).toEqual(["ENCRYPTION_KEYS entry #2 repeats version 1"]);
    expect(
      ring({ ENCRYPTION_KEYS: `1:${KEY_A},,2:${KEY_B}`, ENCRYPTION_ACTIVE_KEY_VERSION: "1" }),
    ).toEqual(["ENCRYPTION_KEYS entry #2 is empty"]);
    expect(ring({ ENCRYPTION_KEYS: `${KEY_A}`, ENCRYPTION_ACTIVE_KEY_VERSION: "1" })).toEqual([
      "ENCRYPTION_KEYS entry #1 has no valid <version>: prefix",
    ]);
    expect(
      ring({ ENCRYPTION_KEYS: `1:${KEY_A},2:short`, ENCRYPTION_ACTIVE_KEY_VERSION: "1" }),
    ).toEqual([
      "ENCRYPTION_KEYS entry #2 (version 2) must be canonical base64 of exactly 32 bytes",
    ]);
  });

  it("a placeholder ring fails outside development and is unconfigured in development", () => {
    expect(ring({ ENCRYPTION_KEYS: "1:change-me", ENCRYPTION_ACTIVE_KEY_VERSION: "1" })).toEqual([
      "ENCRYPTION_KEY/ENCRYPTION_KEYS is still the change-me placeholder (allowed in development only)",
    ]);
    const env = validateRuntimeEnv({
      ...EXAMPLE,
      ENCRYPTION_KEY: undefined,
      ENCRYPTION_KEYS: "1:change-me",
    });
    expect(env.encryptionKeyRing).toBeNull();
  });

  it("decodeEncryptionKey is canonical", () => {
    const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    expect(decodeEncryptionKey(KEY_A)).toHaveLength(32);
    expect(decodeEncryptionKey(`${KEY_A} `)).toBeNull();
    expect(decodeEncryptionKey(KEY_A.slice(0, -1))).toBeNull();
    // 32 bytes → 43 data chars + "=": the last data char carries 2 payload bits and 4 unused bits.
    // Flipping an unused bit decodes to the same 32 bytes with Buffer, but is not canonical: rejected.
    const last = KEY_A.at(-2) as string;
    const flipped = ALPHABET[ALPHABET.indexOf(last) ^ 0b0001] as string;
    const nonCanonical = `${KEY_A.slice(0, -2)}${flipped}=`;
    expect(Buffer.from(nonCanonical, "base64").equals(Buffer.from(KEY_A, "base64"))).toBe(true);
    expect(decodeEncryptionKey(nonCanonical)).toBeNull();
  });
});

describe("validateRuntimeEnv · LinkedIn client (T-038)", () => {
  const LINKEDIN = {
    LINKEDIN_CLIENT_ID: "86abcdef",
    LINKEDIN_CLIENT_SECRET: "WPL_AP1.not-a-real-secret",
    LINKEDIN_REDIRECT_URI: "https://ops.example.com/api/v1/auth/linkedin/callback",
    LINKEDIN_PKCE: "disabled",
  };

  it("is off (null) without LINKEDIN_CLIENT_ID, even with the shipped redirect default", () => {
    const env = validateRuntimeEnv({
      ...PRODUCTION,
      LINKEDIN_REDIRECT_URI: "http://localhost:3001/api/v1/auth/linkedin/callback",
    });
    expect(env.linkedin).toBeNull();
  });

  it("parses a complete production client on APP_BASE_URL", () => {
    expect(validateRuntimeEnv({ ...PRODUCTION, ...LINKEDIN }).linkedin).toEqual({
      clientId: "86abcdef",
      clientSecret: "WPL_AP1.not-a-real-secret",
      redirectUri: "https://ops.example.com/api/v1/auth/linkedin/callback",
      pkce: "disabled",
    });
  });

  it("accepts an http loopback redirect outside production", () => {
    const env = validateRuntimeEnv({
      ...PRODUCTION,
      ...LINKEDIN,
      NODE_ENV: "test",
      LINKEDIN_REDIRECT_URI: "http://localhost:3001/api/v1/auth/linkedin/callback",
    });
    expect(env.linkedin?.redirectUri).toBe("http://localhost:3001/api/v1/auth/linkedin/callback");
  });

  it("requires the secret, the redirect and an explicit PKCE mode (N3, no default)", () => {
    expect(issuesOf({ ...PRODUCTION, ...LINKEDIN, LINKEDIN_CLIENT_SECRET: undefined })).toEqual([
      "LINKEDIN_CLIENT_SECRET is required when LINKEDIN_CLIENT_ID is set",
    ]);
    expect(issuesOf({ ...PRODUCTION, ...LINKEDIN, LINKEDIN_REDIRECT_URI: undefined })).toEqual([
      "LINKEDIN_REDIRECT_URI is required when LINKEDIN_CLIENT_ID is set",
    ]);
    expect(issuesOf({ ...PRODUCTION, ...LINKEDIN, LINKEDIN_PKCE: undefined })).toEqual([
      "LINKEDIN_PKCE must be set explicitly (required or disabled) when LINKEDIN_CLIENT_ID is set",
    ]);
    expect(issuesOf({ ...PRODUCTION, ...LINKEDIN, LINKEDIN_CLIENT_SECRET: "change-me" })).toEqual([
      "LINKEDIN_CLIENT_SECRET is still the change-me placeholder (allowed in development only)",
    ]);
  });

  it("rejects a redirect off APP_BASE_URL, over http, on another path or with a query in production", () => {
    for (const uri of [
      "https://evil.example.com/api/v1/auth/linkedin/callback",
      "http://ops.example.com/api/v1/auth/linkedin/callback",
      "http://localhost:3001/api/v1/auth/linkedin/callback",
    ]) {
      expect(issuesOf({ ...PRODUCTION, ...LINKEDIN, LINKEDIN_REDIRECT_URI: uri })).toEqual([
        "LINKEDIN_REDIRECT_URI must be https on APP_BASE_URL in production",
      ]);
    }
    expect(
      issuesOf({
        ...PRODUCTION,
        ...LINKEDIN,
        LINKEDIN_REDIRECT_URI: "https://ops.example.com/callback",
      }),
    ).toEqual(["LINKEDIN_REDIRECT_URI must point to /api/v1/auth/linkedin/callback"]);
    expect(
      issuesOf({
        ...PRODUCTION,
        ...LINKEDIN,
        LINKEDIN_REDIRECT_URI: "https://ops.example.com/api/v1/auth/linkedin/callback?x=1",
      }),
    ).toEqual(["LINKEDIN_REDIRECT_URI must not carry credentials, query or fragment"]);
    expect(
      issuesOf({
        ...PRODUCTION,
        ...LINKEDIN,
        NODE_ENV: "test",
        LINKEDIN_REDIRECT_URI: "http://ops.example.com/api/v1/auth/linkedin/callback",
      }),
    ).toEqual(["LINKEDIN_REDIRECT_URI must use https (http only on loopback outside production)"]);
  });

  it("never echoes the client secret in an issue", () => {
    const issues = issuesOf({ ...PRODUCTION, ...LINKEDIN, LINKEDIN_REDIRECT_URI: "nope" });
    expect(issues.join("\n")).not.toContain(LINKEDIN.LINKEDIN_CLIENT_SECRET);
  });
});

describe("validateRuntimeEnv · TRUSTED_PROXY_CIDRS (T-015)", () => {
  it("defaults to trusting no proxy", () => {
    expect(validateRuntimeEnv(PRODUCTION).trustedProxyCidrs).toEqual([]);
    expect(
      validateRuntimeEnv({ ...PRODUCTION, TRUSTED_PROXY_CIDRS: " " }).trustedProxyCidrs,
    ).toEqual([]);
  });

  it("accepts explicit IPs and CIDRs of both families", () => {
    const env = validateRuntimeEnv({
      ...PRODUCTION,
      TRUSTED_PROXY_CIDRS: "172.18.0.0/16, 10.0.0.5,fd00::/64,::1",
    });
    expect(env.trustedProxyCidrs).toEqual(["172.18.0.0/16", "10.0.0.5", "fd00::/64", "::1"]);
  });

  it.each([
    "private_ranges",
    "true",
    "*",
    "0.0.0.0/0",
    "10.0.0.0/7",
    "::/0",
    "172.18.0.0/33",
    "172.18.0.0/16/1",
    "172.18.0.0,",
    "example.com",
  ])("refuses %s", (value) => {
    const issues = issuesOf({ ...PRODUCTION, TRUSTED_PROXY_CIDRS: value });
    expect(issues.some((issue) => issue.startsWith("TRUSTED_PROXY_CIDRS"))).toBe(true);
    expect(issues.join("\n")).not.toContain(value);
  });
});

describe("validateWorkerEnv (Career; ADR-0002, ADR-0008, Sentinela PR #89)", () => {
  const OPENAI_KEY = `sk-test-${randomBytes(24).toString("hex")}`;
  /** Only what the worker gets from Compose: no session, cipher or LinkedIn variables. */
  const WORKER_PRODUCTION = { NODE_ENV: "production", DATABASE_URL: DB_URL };

  function workerIssues(env: Record<string, string | undefined>): string[] {
    try {
      validateWorkerEnv(env);
    } catch (error) {
      if (error instanceof RuntimeEnvError) return [...error.issues];
      throw error;
    }
    return [];
  }

  it("requires OPENAI_API_KEY and OPENAI_MODEL in production", () => {
    expect(workerIssues(WORKER_PRODUCTION)).toEqual([
      expect.stringMatching(/^OPENAI_API_KEY is required/),
      expect.stringMatching(/^OPENAI_MODEL is required/),
    ]);
  });

  it("boots without SESSION_SECRET, ENCRYPTION_KEY, APP_BASE_URL or LinkedIn credentials", () => {
    const env = validateWorkerEnv({
      ...WORKER_PRODUCTION,
      OPENAI_API_KEY: OPENAI_KEY,
      OPENAI_MODEL: "gpt-5.1-mini",
    });
    expect(env).toEqual({
      nodeEnv: "production",
      logLevel: "info",
      databaseUrl: DB_URL,
      openai: { apiKey: OPENAI_KEY, model: "gpt-5.1-mini" },
      jobFetchLinkedIn: "enabled",
    });
  });

  it("never reads API secrets, even when present", () => {
    const env = validateWorkerEnv({
      ...PRODUCTION,
      LINKEDIN_CLIENT_SECRET: "canary-linkedin-secret",
      OPENAI_API_KEY: OPENAI_KEY,
      OPENAI_MODEL: "gpt-5.1",
    });
    expect(JSON.stringify(env)).not.toMatch(/canary-linkedin-secret|SESSION|ENCRYPTION/);
    expect(Object.keys(env).sort()).toEqual([
      "databaseUrl",
      "jobFetchLinkedIn",
      "logLevel",
      "nodeEnv",
      "openai",
    ]);
  });

  it("never puts the key in a message", () => {
    const issues = workerIssues({
      ...WORKER_PRODUCTION,
      OPENAI_API_KEY: OPENAI_KEY,
      OPENAI_MODEL: "bad model!",
    });
    expect(issues).toHaveLength(1);
    expect(issues.join("\n")).not.toContain(OPENAI_KEY);
  });

  it("outside production may run unconfigured, but not half-configured", () => {
    const dev = { NODE_ENV: "development", DATABASE_URL: EXAMPLE.DATABASE_URL };
    expect(validateWorkerEnv(dev).openai).toBeNull();
    expect(workerIssues({ ...dev, OPENAI_MODEL: "gpt-5.1" })).toEqual([
      expect.stringMatching(/^OPENAI_API_KEY is required/),
    ]);
  });

  it("refuses short, spaced or placeholder keys outside development", () => {
    expect(
      workerIssues({ ...WORKER_PRODUCTION, OPENAI_API_KEY: "sk-short", OPENAI_MODEL: "gpt-5.1" }),
    ).toEqual([expect.stringMatching(/^OPENAI_API_KEY must be a single token/)]);
    expect(
      workerIssues({
        ...WORKER_PRODUCTION,
        OPENAI_API_KEY: "change-me-openai-key-placeholder",
        OPENAI_MODEL: "gpt-5.1",
      }),
    ).toEqual([expect.stringMatching(/placeholder/)]);
  });

  it("requires NODE_ENV and DATABASE_URL", () => {
    expect(workerIssues({})).toEqual(["NODE_ENV is not set"]);
    expect(workerIssues({ NODE_ENV: "test" })).toEqual(["DATABASE_URL is not set"]);
  });
});

describe("validateRuntimeEnv · API never takes OpenAI credentials; JOB_FETCH_LINKEDIN", () => {
  it("the API environment has no OpenAI field", () => {
    const env = validateRuntimeEnv({
      ...PRODUCTION,
      OPENAI_API_KEY: ["sk", "test", "canary", "value", "0123456789"].join("-"),
    });
    expect(JSON.stringify(env)).not.toContain("canary");
    expect("openai" in env).toBe(false);
  });

  it("JOB_FETCH_LINKEDIN defaults to enabled and accepts only enabled|disabled", () => {
    expect(validateRuntimeEnv(PRODUCTION).jobFetchLinkedIn).toBe("enabled");
    expect(
      validateRuntimeEnv({ ...PRODUCTION, JOB_FETCH_LINKEDIN: "disabled" }).jobFetchLinkedIn,
    ).toBe("disabled");
    expect(issuesOf({ ...PRODUCTION, JOB_FETCH_LINKEDIN: "off" })).toEqual([
      "JOB_FETCH_LINKEDIN must be one of enabled, disabled",
    ]);
  });
});
