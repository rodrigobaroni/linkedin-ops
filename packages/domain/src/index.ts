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
