/// <reference types="node" />
/**
 * Runtime environment validation shared by `apps/api` and `apps/worker` (T-008; threat model SEC-004;
 * ADR-0004 items 3, 4 and 13(a)). Boot calls `validateRuntimeEnv(process.env)` before anything else and
 * exits on the first failure. Every check fails closed and no error message ever contains a value: only
 * variable names and the reason.
 */
import { Buffer } from "node:buffer";
import { isIPv4, isIPv6 } from "node:net";
import type { EnvironmentLike } from "./guards.js";

export const RUNTIME_ENVIRONMENTS = ["development", "test", "production"] as const;
export type RuntimeEnvironment = (typeof RUNTIME_ENVIRONMENTS)[number];

export const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** ADR-0007 N3: PKCE mode is explicit, never guessed. T-038 makes it mandatory outside development. */
export const LINKEDIN_PKCE_MODES = ["required", "disabled"] as const;
export type LinkedInPkceMode = (typeof LINKEDIN_PKCE_MODES)[number];

/** ADR-0008 §4 kill switch for anonymous LinkedIn job-page fetching. Default `enabled` (decision D2). */
export const JOB_FETCH_LINKEDIN_MODES = ["enabled", "disabled"] as const;
export type JobFetchLinkedInMode = (typeof JOB_FETCH_LINKEDIN_MODES)[number];
/** T-063: `dry-run` (default) only counts what the daily purge would delete; `enabled` deletes. */
export const RETENTION_PURGE_MODES = ["dry-run", "enabled"] as const;
export type RetentionPurgeMode = (typeof RETENTION_PURGE_MODES)[number];

export const OPENAI_API_KEY_MIN_LENGTH = 20;
const OPENAI_MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;

export const DEFAULT_API_PORT = 3001;
export const SESSION_SECRET_MIN_BYTES = 32;
export const ENCRYPTION_KEY_BYTES = 32;

/** `.env.example` placeholders (`change-me*`). Tolerated in `development` only (SEC-004). */
export const PLACEHOLDER_PATTERN = /change[-_]?me/i;

/** Key ring for token encryption at rest (ADR-0004 item 3). `keys` are raw 32-byte KEKs by version. */
export interface EncryptionKeyRing {
  activeVersion: number;
  keys: ReadonlyMap<number, Uint8Array>;
}

/** Path the LinkedIn redirect URI must point to (contracts `integrations.linkedin.callback`). */
export const LINKEDIN_CALLBACK_PATH = "/api/v1/auth/linkedin/callback";

/** LinkedIn app credentials (T-038). Present only when `LINKEDIN_CLIENT_ID` is set. */
export interface LinkedInClientConfig {
  clientId: string;
  /** Confidential client secret. Never log it, never send it anywhere but the token endpoint. */
  clientSecret: string;
  /** Registered redirect URI, sent byte-for-byte in authorize and token exchange. */
  redirectUri: string;
  /** ADR-0007 N3: explicit, mandatory once the client is configured. */
  pkce: LinkedInPkceMode;
}

/** OpenAI credentials of the worker. Never log `apiKey`, never send it anywhere but the OpenAI API. */
export interface OpenAiConfig {
  apiKey: string;
  model: string;
}

export interface RuntimeEnv {
  nodeEnv: RuntimeEnvironment;
  /** Origin (`scheme://host[:port]`) the browser uses; `Origin` of every mutation must equal it (ADR-0007 N4). */
  appBaseUrl: string;
  apiHost: string;
  apiPort: number;
  logLevel: LogLevel;
  /** PostgreSQL connection string. Never log it. */
  databaseUrl: string;
  /** HMAC key for session-bound CSRF tokens (ADR-0007 N2). Never log it. */
  sessionSecret: string;
  /**
   * `null` only in `development` when `ENCRYPTION_KEY`/`ENCRYPTION_KEYS` is unset or still the placeholder:
   * the vault (T-052) then refuses to encrypt. Outside development the ring is mandatory.
   */
  encryptionKeyRing: EncryptionKeyRing | null;
  /**
   * `null` = not configured (allowed while `LINKEDIN_CLIENT_ID` is unset). `null` comes first on purpose:
   * `<name>: <16-letter type>` matched gitleaks' linkedin-client-secret rule (see .gitleaksignore).
   */
  linkedinPkce: null | LinkedInPkceMode;
  /** `null` = LinkedIn integration not configured: connect/publish answer `503 SERVICE_NOT_READY`. */
  linkedin: LinkedInClientConfig | null;
  /**
   * Reverse proxies whose `X-Forwarded-For` is honoured to find the client IP (login throttling, audit).
   * Empty by default: then the socket address is the client IP and forwarded headers are ignored.
   */
  trustedProxyCidrs: readonly string[];
  /** ADR-0008 kill switch: `disabled` sends LinkedIn job URLs straight to paste-text. */
  jobFetchLinkedIn: JobFetchLinkedInMode;
}

/**
 * Environment of `apps/worker` (`validateWorkerEnv`). Deliberately narrow (ADR-0002, ADR-0008, Sentinela PR #89):
 * no session secret, no token-encryption key, no LinkedIn credentials ever reach the worker or the job-page
 * fetcher.
 */
export interface WorkerRuntimeEnv {
  nodeEnv: RuntimeEnvironment;
  logLevel: LogLevel;
  /** PostgreSQL connection string (pg-boss). Never log it. */
  databaseUrl: string;
  /** Mandatory in production; `null` elsewhere when unset (Career jobs then fail closed as not configured). */
  openai: OpenAiConfig | null;
  /** ADR-0008 kill switch: `disabled` sends LinkedIn job URLs straight to paste-text. */
  jobFetchLinkedIn: JobFetchLinkedInMode;
  /** T-063 daily purge: `dry-run` unless explicitly `enabled` (deleting is irreversible). */
  retentionPurge: RetentionPurgeMode;
}

export class RuntimeEnvError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid runtime environment:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`);
    this.name = "RuntimeEnvError";
    this.issues = issues;
  }
}

function read(env: EnvironmentLike, name: string): string | undefined {
  const value = env[name];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

const CANONICAL_BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Strict base64 decode of exactly `ENCRYPTION_KEY_BYTES`: canonical alphabet and padding, no whitespace,
 * and the value must round-trip (so `Buffer`'s lenient decoder cannot accept garbage). `null` when invalid.
 */
export function decodeEncryptionKey(value: string): Uint8Array | null {
  if (value.length % 4 !== 0 || !CANONICAL_BASE64.test(value)) return null;
  const bytes = Buffer.from(value, "base64");
  if (bytes.length !== ENCRYPTION_KEY_BYTES) return null;
  if (bytes.toString("base64") !== value) return null;
  return new Uint8Array(bytes);
}

const KEY_VERSION = /^[1-9][0-9]{0,8}$/;

/**
 * Parses the key ring per ADR-0004 item 13(a): either `ENCRYPTION_KEY` (shorthand for version 1) **or**
 * `ENCRYPTION_KEYS` (`<version>:<base64>` pairs) with `ENCRYPTION_ACTIVE_KEY_VERSION`; never both, never
 * a fallback. Returns the ring or pushes reasons into `issues` (positions, never key material).
 */
function parseKeyRing(env: EnvironmentLike, issues: string[]): EncryptionKeyRing | null {
  const single = read(env, "ENCRYPTION_KEY");
  const ring = read(env, "ENCRYPTION_KEYS");
  const active = read(env, "ENCRYPTION_ACTIVE_KEY_VERSION");

  if (single !== undefined && ring !== undefined) {
    issues.push(
      "ENCRYPTION_KEY and ENCRYPTION_KEYS are both set; configure exactly one (no fallback)",
    );
    return null;
  }

  if (single !== undefined) {
    if (active !== undefined && active !== "1") {
      issues.push(
        "ENCRYPTION_ACTIVE_KEY_VERSION must be unset or 1 when ENCRYPTION_KEY (version 1) is used",
      );
      return null;
    }
    const key = decodeEncryptionKey(single);
    if (!key) {
      issues.push(
        `ENCRYPTION_KEY must be canonical base64 of exactly ${ENCRYPTION_KEY_BYTES} bytes`,
      );
      return null;
    }
    return { activeVersion: 1, keys: new Map([[1, key]]) };
  }

  if (ring === undefined) return null;

  if (active === undefined) {
    issues.push(
      "ENCRYPTION_ACTIVE_KEY_VERSION is required when ENCRYPTION_KEYS is set (no fallback)",
    );
    return null;
  }
  if (!KEY_VERSION.test(active)) {
    issues.push("ENCRYPTION_ACTIVE_KEY_VERSION must be a positive integer");
    return null;
  }

  const keys = new Map<number, Uint8Array>();
  const entries = ring.split(",");
  let valid = true;
  entries.forEach((rawEntry, index) => {
    const position = index + 1;
    const entry = rawEntry.trim();
    if (entry === "") {
      issues.push(`ENCRYPTION_KEYS entry #${position} is empty`);
      valid = false;
      return;
    }
    const separator = entry.indexOf(":");
    const version = separator === -1 ? "" : entry.slice(0, separator);
    const material = separator === -1 ? "" : entry.slice(separator + 1);
    if (!KEY_VERSION.test(version)) {
      issues.push(`ENCRYPTION_KEYS entry #${position} has no valid <version>: prefix`);
      valid = false;
      return;
    }
    const versionNumber = Number(version);
    if (keys.has(versionNumber)) {
      issues.push(`ENCRYPTION_KEYS entry #${position} repeats version ${version}`);
      valid = false;
      return;
    }
    const key = decodeEncryptionKey(material);
    if (!key) {
      issues.push(
        `ENCRYPTION_KEYS entry #${position} (version ${version}) must be canonical base64 of exactly ${ENCRYPTION_KEY_BYTES} bytes`,
      );
      valid = false;
      return;
    }
    keys.set(versionNumber, key);
  });
  if (!valid) return null;

  const activeVersion = Number(active);
  if (!keys.has(activeVersion)) {
    issues.push(`ENCRYPTION_ACTIVE_KEY_VERSION=${active} is not present in ENCRYPTION_KEYS`);
    return null;
  }
  return { activeVersion, keys };
}

function parseAppBaseUrl(
  value: string | undefined,
  nodeEnv: RuntimeEnvironment,
  issues: string[],
): string | null {
  if (value === undefined) {
    issues.push("APP_BASE_URL is not set");
    return null;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    issues.push("APP_BASE_URL is not a valid absolute URL");
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    issues.push("APP_BASE_URL must use http or https");
    return null;
  }
  if (url.protocol === "http:" && nodeEnv === "production") {
    issues.push("APP_BASE_URL must use https in production");
    return null;
  }
  if (url.username !== "" || url.password !== "") {
    issues.push("APP_BASE_URL must not carry credentials");
    return null;
  }
  if ((url.pathname !== "/" && url.pathname !== "") || url.search !== "" || url.hash !== "") {
    issues.push("APP_BASE_URL must be an origin only (no path, query or fragment)");
    return null;
  }
  return url.origin;
}

function parseDatabaseUrl(
  value: string | undefined,
  nodeEnv: RuntimeEnvironment,
  issues: string[],
): string | null {
  if (value === undefined) {
    issues.push("DATABASE_URL is not set");
    return null;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    issues.push("DATABASE_URL is not a valid URL");
    return null;
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    issues.push("DATABASE_URL must use the postgresql:// scheme");
    return null;
  }
  if (nodeEnv !== "development" && PLACEHOLDER_PATTERN.test(value)) {
    issues.push(
      "DATABASE_URL still contains a change-me placeholder (allowed in development only)",
    );
    return null;
  }
  return value;
}

function parseSessionSecret(
  value: string | undefined,
  nodeEnv: RuntimeEnvironment,
  issues: string[],
): string | null {
  if (value === undefined) {
    issues.push("SESSION_SECRET is not set");
    return null;
  }
  if (Buffer.byteLength(value, "utf8") < SESSION_SECRET_MIN_BYTES) {
    issues.push(`SESSION_SECRET must be at least ${SESSION_SECRET_MIN_BYTES} bytes`);
    return null;
  }
  if (nodeEnv !== "development" && PLACEHOLDER_PATTERN.test(value)) {
    issues.push("SESSION_SECRET is still the change-me placeholder (allowed in development only)");
    return null;
  }
  return value;
}

function parsePort(value: string | undefined, issues: string[]): number {
  if (value === undefined) return DEFAULT_API_PORT;
  if (!/^[0-9]{1,5}$/.test(value) || Number(value) < 1 || Number(value) > 65_535) {
    issues.push("API_PORT must be an integer between 1 and 65535");
    return DEFAULT_API_PORT;
  }
  return Number(value);
}

function parseEnum<const T extends readonly string[]>(
  name: string,
  value: string | undefined,
  allowed: T,
  issues: string[],
): T[number] | undefined {
  if (value === undefined) return undefined;
  if (!(allowed as readonly string[]).includes(value)) {
    issues.push(`${name} must be one of ${allowed.join(", ")}`);
    return undefined;
  }
  return value as T[number];
}

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * LinkedIn client (T-038). `LINKEDIN_CLIENT_ID` switches the integration on; then the secret, the redirect
 * URI and an explicit `LINKEDIN_PKCE` are mandatory. The redirect must point to the API callback; in
 * production it must be https on `APP_BASE_URL` itself, elsewhere https or http on loopback.
 */
function parseLinkedIn(
  env: EnvironmentLike,
  nodeEnv: RuntimeEnvironment,
  appBaseUrl: string | null,
  pkce: LinkedInPkceMode | null,
  issues: string[],
): LinkedInClientConfig | null {
  const clientId = read(env, "LINKEDIN_CLIENT_ID");
  if (clientId === undefined) return null;
  const clientSecret = read(env, "LINKEDIN_CLIENT_SECRET");
  const redirectUri = read(env, "LINKEDIN_REDIRECT_URI");
  const before = issues.length;
  if (clientSecret === undefined)
    issues.push("LINKEDIN_CLIENT_SECRET is required when LINKEDIN_CLIENT_ID is set");
  else if (nodeEnv !== "development" && PLACEHOLDER_PATTERN.test(clientSecret)) {
    issues.push(
      "LINKEDIN_CLIENT_SECRET is still the change-me placeholder (allowed in development only)",
    );
  }
  if (pkce === null && read(env, "LINKEDIN_PKCE") === undefined) {
    issues.push(
      "LINKEDIN_PKCE must be set explicitly (required or disabled) when LINKEDIN_CLIENT_ID is set",
    );
  }
  if (redirectUri === undefined) {
    issues.push("LINKEDIN_REDIRECT_URI is required when LINKEDIN_CLIENT_ID is set");
  } else {
    let url: URL | null = null;
    try {
      url = new URL(redirectUri);
    } catch {
      issues.push("LINKEDIN_REDIRECT_URI is not a valid absolute URL");
    }
    if (url) {
      const loopbackHttp = url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
      if (url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") {
        issues.push("LINKEDIN_REDIRECT_URI must not carry credentials, query or fragment");
      } else if (url.pathname !== LINKEDIN_CALLBACK_PATH) {
        issues.push(`LINKEDIN_REDIRECT_URI must point to ${LINKEDIN_CALLBACK_PATH}`);
      } else if (nodeEnv === "production") {
        if (url.protocol !== "https:" || (appBaseUrl !== null && url.origin !== appBaseUrl)) {
          issues.push("LINKEDIN_REDIRECT_URI must be https on APP_BASE_URL in production");
        }
      } else if (url.protocol !== "https:" && !loopbackHttp) {
        issues.push(
          "LINKEDIN_REDIRECT_URI must use https (http only on loopback outside production)",
        );
      }
    }
  }
  if (
    issues.length > before ||
    clientSecret === undefined ||
    redirectUri === undefined ||
    pkce === null
  ) {
    return null;
  }
  return { clientId, clientSecret, redirectUri, pkce };
}

/**
 * `TRUSTED_PROXY_CIDRS`: comma-separated IPs or CIDRs (`172.18.0.0/16`, `10.0.0.5`, `fd00::/64`). Never a
 * keyword such as `private_ranges` or `true`: trusting a whole family would let any client forge its IP.
 */
function parseTrustedProxies(value: string | undefined, issues: string[]): string[] {
  if (value === undefined) return [];
  const entries = value.split(",").map((entry) => entry.trim());
  const valid: string[] = [];
  entries.forEach((entry, index) => {
    const [address = "", prefix, extra] = entry.split("/");
    const family = isIPv4(address) ? 4 : isIPv6(address) ? 6 : 0;
    const maxPrefix = family === 4 ? 32 : 128;
    const prefixOk =
      prefix === undefined ||
      (/^[0-9]{1,3}$/.test(prefix) && Number(prefix) >= 8 && Number(prefix) <= maxPrefix);
    if (family === 0 || extra !== undefined || !prefixOk) {
      issues.push(
        `TRUSTED_PROXY_CIDRS entry #${index + 1} must be an IP or CIDR with a prefix of at least /8`,
      );
      return;
    }
    valid.push(entry);
  });
  return valid;
}

/**
 * `OPENAI_API_KEY` / `OPENAI_MODEL` (worker only; the API never reads them). Both or neither outside production; both in production.
 * Placeholders are refused outside development; messages never contain the values.
 */
function parseOpenAi(
  env: EnvironmentLike,
  nodeEnv: RuntimeEnvironment,
  issues: string[],
): OpenAiConfig | null {
  const apiKey = read(env, "OPENAI_API_KEY");
  const model = read(env, "OPENAI_MODEL");
  if (apiKey === undefined && model === undefined && nodeEnv !== "production") return null;
  const before = issues.length;
  if (apiKey === undefined) {
    issues.push("OPENAI_API_KEY is required for the worker in production (and with OPENAI_MODEL)");
  } else if (/\s/.test(apiKey) || apiKey.length < OPENAI_API_KEY_MIN_LENGTH) {
    issues.push(
      `OPENAI_API_KEY must be a single token of at least ${OPENAI_API_KEY_MIN_LENGTH} characters`,
    );
  } else if (nodeEnv !== "development" && PLACEHOLDER_PATTERN.test(apiKey)) {
    issues.push("OPENAI_API_KEY is still the change-me placeholder (allowed in development only)");
  }
  if (model === undefined) {
    issues.push("OPENAI_MODEL is required for the worker in production (and with OPENAI_API_KEY)");
  } else if (!OPENAI_MODEL_PATTERN.test(model)) {
    issues.push("OPENAI_MODEL must be a model id (letters, digits, . _ : -; up to 100 characters)");
  }
  if (issues.length > before || apiKey === undefined || model === undefined) return null;
  return { apiKey, model };
}

/**
 * Validates and normalizes the runtime environment. Throws `RuntimeEnvError` listing every problem found
 * (names and reasons only). `NODE_ENV` is mandatory: an unset value is refused, never assumed.
 */
export function validateRuntimeEnv(env: EnvironmentLike): RuntimeEnv {
  const issues: string[] = [];

  const nodeEnvRaw = read(env, "NODE_ENV");
  const nodeEnv = parseEnum("NODE_ENV", nodeEnvRaw, RUNTIME_ENVIRONMENTS, issues);
  if (nodeEnvRaw === undefined) issues.push("NODE_ENV is not set");
  if (nodeEnv === undefined) throw new RuntimeEnvError(issues);

  const appBaseUrl = parseAppBaseUrl(read(env, "APP_BASE_URL"), nodeEnv, issues);
  const apiPort = parsePort(read(env, "API_PORT"), issues);
  const apiHost = read(env, "API_HOST") ?? (nodeEnv === "production" ? "0.0.0.0" : "127.0.0.1");
  const logLevel = parseEnum("LOG_LEVEL", read(env, "LOG_LEVEL"), LOG_LEVELS, issues) ?? "info";
  const databaseUrl = parseDatabaseUrl(read(env, "DATABASE_URL"), nodeEnv, issues);
  const sessionSecret = parseSessionSecret(read(env, "SESSION_SECRET"), nodeEnv, issues);
  const linkedinPkce =
    parseEnum("LINKEDIN_PKCE", read(env, "LINKEDIN_PKCE"), LINKEDIN_PKCE_MODES, issues) ?? null;
  const trustedProxyCidrs = parseTrustedProxies(read(env, "TRUSTED_PROXY_CIDRS"), issues);

  const singleKey = read(env, "ENCRYPTION_KEY");
  const ringKeys = read(env, "ENCRYPTION_KEYS");
  const encryptionPlaceholder =
    (singleKey !== undefined && PLACEHOLDER_PATTERN.test(singleKey)) ||
    (ringKeys !== undefined && PLACEHOLDER_PATTERN.test(ringKeys));
  const encryptionUnset = singleKey === undefined && ringKeys === undefined;

  let encryptionKeyRing: EncryptionKeyRing | null = null;
  if (encryptionPlaceholder || encryptionUnset) {
    if (nodeEnv !== "development") {
      issues.push(
        encryptionUnset
          ? "ENCRYPTION_KEY or ENCRYPTION_KEYS must be set outside development"
          : "ENCRYPTION_KEY/ENCRYPTION_KEYS is still the change-me placeholder (allowed in development only)",
      );
    }
  } else {
    encryptionKeyRing = parseKeyRing(env, issues);
  }

  const linkedin = parseLinkedIn(env, nodeEnv, appBaseUrl, linkedinPkce, issues);
  const jobFetchLinkedIn = parseJobFetchLinkedIn(env, issues);

  if (issues.length > 0 || appBaseUrl === null || databaseUrl === null || sessionSecret === null) {
    throw new RuntimeEnvError(issues);
  }

  return {
    nodeEnv,
    appBaseUrl,
    apiHost,
    apiPort,
    logLevel,
    databaseUrl,
    sessionSecret,
    encryptionKeyRing,
    linkedinPkce,
    linkedin,
    trustedProxyCidrs,
    jobFetchLinkedIn,
  };
}

function parseJobFetchLinkedIn(env: EnvironmentLike, issues: string[]): JobFetchLinkedInMode {
  return (
    parseEnum(
      "JOB_FETCH_LINKEDIN",
      read(env, "JOB_FETCH_LINKEDIN"),
      JOB_FETCH_LINKEDIN_MODES,
      issues,
    ) ?? "enabled"
  );
}

/**
 * Validates the worker environment. Same fail-closed rules and messages as `validateRuntimeEnv`, but it reads
 * only what the worker uses: never `SESSION_SECRET`, `ENCRYPTION_KEY(S)` or `LINKEDIN_*`.
 */
export function validateWorkerEnv(env: EnvironmentLike): WorkerRuntimeEnv {
  const issues: string[] = [];
  const nodeEnvRaw = read(env, "NODE_ENV");
  const nodeEnv = parseEnum("NODE_ENV", nodeEnvRaw, RUNTIME_ENVIRONMENTS, issues);
  if (nodeEnvRaw === undefined) issues.push("NODE_ENV is not set");
  if (nodeEnv === undefined) throw new RuntimeEnvError(issues);

  const logLevel = parseEnum("LOG_LEVEL", read(env, "LOG_LEVEL"), LOG_LEVELS, issues) ?? "info";
  const databaseUrl = parseDatabaseUrl(read(env, "DATABASE_URL"), nodeEnv, issues);
  const openai = parseOpenAi(env, nodeEnv, issues);
  const jobFetchLinkedIn = parseJobFetchLinkedIn(env, issues);
  const retentionPurge =
    parseEnum("RETENTION_PURGE", read(env, "RETENTION_PURGE"), RETENTION_PURGE_MODES, issues) ??
    "dry-run";

  if (issues.length > 0 || databaseUrl === null) throw new RuntimeEnvError(issues);
  return { nodeEnv, logLevel, databaseUrl, openai, jobFetchLinkedIn, retentionPurge };
}
