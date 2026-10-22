import type { z } from "zod";
import {
  ActorTypeSchema,
  ApprovalDecisionSchema,
  AuditActorTypeSchema,
  AutonomyModeSchema,
  CurationRunStatusSchema,
  CurationRunTriggerSchema,
  CvDraftStatusSchema,
  CvExtractionFailureSchema,
  DraftStatusSchema,
  DraftVersionAuthorTypeSchema,
  LanguageSchema,
  LinkedInUploadStatusSchema,
  MediaAssetStatusSchema,
  MediaKindSchema,
  MediaOriginSchema,
  NotificationChannelSchema,
  NotificationKindSchema,
  NotificationStatusSchema,
  OpportunityOriginSchema,
  OpportunityStatusSchema,
  PublicationStatusSchema,
  ScheduleStatusSchema,
  SourceFetchStatusSchema,
  SourceTypeSchema,
  StoryBankEntryStatusSchema,
  SuggestedFormatSchema,
  TrustLevelSchema,
  UserRoleSchema,
} from "@linkedin-ops/contracts";
import { parsePrismaEnums, type PrismaEnum } from "./prisma-schema.js";

/**
 * The contracts ↔ schema.prisma enum matrix, shared by the unit parity test (`enums-parity.test.ts`)
 * and the integration test that compares it with the enums actually migrated into PostgreSQL
 * (`integration/database.integration.test.ts`).
 *
 * contracts.md §4: "Enums são `z.enum` únicos; o Prisma `enum` espelha; teste garante paridade."
 * The database value of each Prisma enum (the `@map`ped value when present) must equal the contract
 * value, in the same order, so rows never need a translation layer and raw SQL reads contract values.
 */
export const MIRRORED: Record<string, z.ZodEnum<Record<string, string>>> = {
  UserRole: UserRoleSchema,
  AutonomyMode: AutonomyModeSchema,
  Language: LanguageSchema,
  StoryBankEntryStatus: StoryBankEntryStatusSchema,
  SourceType: SourceTypeSchema,
  TrustLevel: TrustLevelSchema,
  SourceFetchStatus: SourceFetchStatusSchema,
  CurationRunTrigger: CurationRunTriggerSchema,
  CurationRunStatus: CurationRunStatusSchema,
  OpportunityOrigin: OpportunityOriginSchema,
  OpportunityStatus: OpportunityStatusSchema,
  SuggestedFormat: SuggestedFormatSchema,
  DraftStatus: DraftStatusSchema,
  DraftVersionAuthorType: DraftVersionAuthorTypeSchema,
  ApprovalDecision: ApprovalDecisionSchema,
  ActorType: ActorTypeSchema,
  AuditActorType: AuditActorTypeSchema,
  ScheduleStatus: ScheduleStatusSchema,
  PublicationStatus: PublicationStatusSchema,
  MediaOrigin: MediaOriginSchema,
  MediaKind: MediaKindSchema,
  LinkedInUploadStatus: LinkedInUploadStatusSchema,
  MediaAssetStatus: MediaAssetStatusSchema,
  NotificationChannel: NotificationChannelSchema,
  NotificationKind: NotificationKindSchema,
  NotificationStatus: NotificationStatusSchema,
  CvDraftStatus: CvDraftStatusSchema,
  CvExtractionFailure: CvExtractionFailureSchema,
};

/** Enums that exist only in the database, with the reason there is no contract counterpart. */
export const DATABASE_ONLY: Record<string, string> = {
  OAuthProvider:
    "Internal discriminator; the API exposes the LinkedIn integration, not a provider list.",
  TokenStatus:
    "Credential lifecycle (ADR-0004 §11). The API maps it to LinkedInIntegrationStatus, where DISCONNECTED = no row.",
};

/**
 * What PostgreSQL must contain after the migrations: every enum of schema.prisma, keyed by its
 * database type name, with the ordered labels the matrix prescribes (contract values for mirrored
 * enums, the schema's `@map`ped values for database-only ones). Throws on an enum outside the matrix,
 * so a new Prisma enum cannot reach the database without being classified first.
 */
export function expectedDatabaseEnums(
  prismaEnums: PrismaEnum[] = parsePrismaEnums(),
): Record<string, string[]> {
  const expected: Record<string, string[]> = {};
  for (const prismaEnum of prismaEnums) {
    const contract = MIRRORED[prismaEnum.name];
    if (contract) {
      expected[prismaEnum.dbName] = [...contract.options];
    } else if (prismaEnum.name in DATABASE_ONLY) {
      expected[prismaEnum.dbName] = prismaEnum.values.map((v) => v.dbValue);
    } else {
      throw new Error(`${prismaEnum.name} is neither mirrored nor declared database-only`);
    }
  }
  return expected;
}
