// @linkedin-ops/domain — entities, content state machine, autonomy policy, application services and
// the Prisma data layer (ADR-0001 structure amendment). T-005 ships the data layer baseline only.
export { createPrismaClient, type CreatePrismaClientOptions, type PrismaClient } from "./client.js";
export { newId } from "./ids.js";
export type * from "./generated/prisma/models.js";
export * as DbEnums from "./generated/prisma/enums.js";
