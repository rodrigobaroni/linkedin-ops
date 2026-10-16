import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  ActorTypeSchema,
  ApprovalDecisionSchema,
  AuditActorTypeSchema,
  AutonomyModeSchema,
  CurationRunStatusSchema,
  CurationRunTriggerSchema,
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
import * as DbEnums from "../src/generated/prisma/enums.js";
import { parsePrismaEnums } from "./prisma-schema.js";

/**
 * contracts.md §4: "Enums são `z.enum` únicos; o Prisma `enum` espelha; teste garante paridade."
 * The database value of each Prisma enum (the `@map`ped value when present) must equal the contract
 * value, in the same order, so rows never need a translation layer and raw SQL reads contract values.
 */
const MIRRORED: Record<string, z.ZodEnum<Record<string, string>>> = {
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
};

/** Enums that exist only in the database, with the reason there is no contract counterpart. */
const DATABASE_ONLY: Record<string, string> = {
  OAuthProvider:
    "Internal discriminator; the API exposes the LinkedIn integration, not a provider list.",
  TokenStatus:
    "Credential lifecycle (ADR-0004 §11). The API maps it to LinkedInIntegrationStatus, where DISCONNECTED = no row.",
};

const prismaEnums = parsePrismaEnums();

describe("Prisma enums mirror packages/contracts", () => {
  it("parses every enum block of schema.prisma", () => {
    expect(prismaEnums.length).toBeGreaterThan(20);
    expect(prismaEnums.map((e) => e.name)).toContain("OpportunityStatus");
  });

  it("every Prisma enum is either mirrored from contracts or declared database-only", () => {
    for (const prismaEnum of prismaEnums) {
      const known = prismaEnum.name in MIRRORED || prismaEnum.name in DATABASE_ONLY;
      expect(known, `${prismaEnum.name} is neither mirrored nor declared database-only`).toBe(true);
    }
  });

  it("every mirrored contract enum exists in schema.prisma", () => {
    const names = new Set(prismaEnums.map((e) => e.name));
    for (const name of Object.keys(MIRRORED)) {
      expect(names.has(name), `${name} missing from schema.prisma`).toBe(true);
    }
  });

  for (const [name, schema] of Object.entries(MIRRORED)) {
    it(`${name}: database values equal the contract values, in order`, () => {
      const prismaEnum = prismaEnums.find((e) => e.name === name)!;
      expect(prismaEnum.values.map((v) => v.dbValue)).toEqual(schema.options);
    });
  }

  it("the generated client exposes the Prisma names (not the mapped database values)", () => {
    expect(Object.keys(DbEnums.OpportunityStatus)).toEqual([
      "CANDIDATE",
      "SELECTED",
      "DISMISSED",
      "EXPIRED",
    ]);
    expect(Object.keys(DbEnums.SuggestedFormat)).toEqual([
      "TEXT",
      "CODE_CARD",
      "IMAGE",
      "CAROUSEL",
    ]);
    expect(Object.keys(DbEnums.Language)).toEqual(["PT_BR", "EN"]);
  });

  it("database-only enums carry a documented reason", () => {
    for (const [name, reason] of Object.entries(DATABASE_ONLY)) {
      expect(
        prismaEnums.some((e) => e.name === name),
        `${name} not in schema`,
      ).toBe(true);
      expect(reason.length).toBeGreaterThan(20);
    }
  });
});
