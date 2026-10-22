// @linkedin-ops/domain — entities, content state machine, autonomy policy, application services and
// the Prisma data layer (ADR-0001 structure amendment). T-005 ships the data layer baseline only.
// Prisma-generated models and enums are an implementation detail of this package and are not exported.
export { createPrismaClient, type CreatePrismaClientOptions, type PrismaClient } from "./client.js";
export { newId } from "./ids.js";
export { hashPassword, verifyPassword, ARGON2ID_PARAMETERS } from "./auth/password.js";
export { canonicalizeUrl, isTrackingParameter } from "./sources/canonical-url.js";
export {
  assertDatabaseScriptAllowed,
  describeDatabaseTarget,
  isDatabaseScriptEnvironment,
  requireDatabaseUrl,
  DATABASE_SCRIPT_ENVIRONMENTS,
  DB_RESET_CONFIRM_VARIABLE,
  type DatabaseScript,
  type DatabaseScriptEnvironment,
  type EnvironmentLike,
} from "./env/guards.js";
export {
  validateRuntimeEnv,
  validateWorkerEnv,
  decodeEncryptionKey,
  RuntimeEnvError,
  RUNTIME_ENVIRONMENTS,
  LOG_LEVELS,
  LINKEDIN_PKCE_MODES,
  LINKEDIN_CALLBACK_PATH,
  DEFAULT_API_PORT,
  SESSION_SECRET_MIN_BYTES,
  ENCRYPTION_KEY_BYTES,
  PLACEHOLDER_PATTERN,
  JOB_FETCH_LINKEDIN_MODES,
  OPENAI_API_KEY_MIN_LENGTH,
  type RuntimeEnv,
  type OpenAiConfig,
  type JobFetchLinkedInMode,
  type WorkerRuntimeEnv,
  type RuntimeEnvironment,
  type LogLevel,
  type LinkedInPkceMode,
  type EncryptionKeyRing,
  type LinkedInClientConfig,
} from "./env/runtime.js";
export {
  TokenVault,
  TokenVaultError,
  TOKEN_VAULT_SCHEMA_VERSION,
  type CredentialRef,
  type SealedCredential,
  type TokenVaultErrorCode,
  type VaultProvider,
  type VaultTokenType,
} from "./crypto/token-vault.js";
export {
  ELEVATION_WINDOW_MS,
  SESSION_ABSOLUTE_TTL_MS,
  SESSION_IDLE_TTL_MS,
  SESSION_TOUCH_INTERVAL_MS,
  type AuthenticatedSession,
  type AuthOutcome,
  type IssuedSession,
  type RequestMeta,
  type SessionService,
} from "./auth/session.js";
export {
  PrismaSessionService,
  deriveCsrfToken,
  hashSessionSecret,
  normalizeEmail,
  type PrismaSessionServiceOptions,
} from "./auth/prisma-session.service.js";
export {
  LoginThrottle,
  THROTTLE_LOCK_MS,
  THROTTLE_MAX_FAILURES,
  THROTTLE_WINDOW_MS,
} from "./auth/login-throttle.js";
export { minimizeIp, truncateUserAgent } from "./auth/client-meta.js";
export {
  PrismaUserProfiles,
  createFirstOwner,
  SetupUserError,
  type UserProfile,
  type UserProfiles,
} from "./auth/users.js";
export {
  PrismaCvBases,
  CvDraftNotReadyError,
  CvInjectionUnacknowledgedError,
  CV_EXTRACTION_STALE_MS,
  CV_EXTRACTION_SWEEP_BATCH,
  CV_INJECTION_EVIDENCE_MAX_CHARS,
  type CvAuditMeta,
  type CvBaseRecord,
  type CvBaseState,
  type CvContentParser,
  type CvDraftRecord,
  type CvExtractEnqueue,
  type CvExtraction,
  type SqlExecutor,
} from "./career/cv-bases.js";
export { PrismaCvBaseDraftStore } from "./career/prisma-cv-base-draft-store.js";
export type {
  CareerFailureReason,
  CareerJobMeta,
  CvBaseDraftStore,
  CvExtractionResult,
  FetchDomainGuard,
  FetchSlot,
  FetchStopSignal,
  GenerationInfo,
  JobPostingSource,
  JobPostingStore,
} from "./career/ports.js";
export {
  ERROR_MESSAGE_OMITTED,
  ERROR_SEARCH_CIRCULAR,
  ERROR_SEARCH_TRUNCATED,
  MAX_ERROR_SEARCH_DEPTH,
  scrubErrorText,
  serializeErrorForLog,
  serializeErrorsDeep,
  isErrorLike,
  LOG_REDACTED,
  safeLogArguments,
  scrubLogObject,
  type SafeLoggedError,
} from "./logging/safe-error.js";
export {
  jobFetchGroupId,
  fetchDomainOfHost,
  fetchDomainPolicy,
  decideFetchSlot,
  tripFetchBreaker,
  killSwitchSlot,
  InMemoryFetchDomainGuard,
  EMPTY_FETCH_DOMAIN_STATE,
  FETCH_BREAKER_OPEN_MS,
  FETCH_QUOTA_WINDOW_MS,
  JOB_FETCH_LINKEDIN_DOMAIN,
  JOB_FETCH_PASTED_GROUP,
  type FetchDomainGuardOptions,
  type FetchDomainPolicy,
  type FetchDomainState,
} from "./career/fetch-domain.js";
