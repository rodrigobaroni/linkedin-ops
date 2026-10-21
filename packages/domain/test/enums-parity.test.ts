import { describe, expect, it } from "vitest";
import * as DbEnums from "../src/generated/prisma/enums.js";
import { DATABASE_ONLY, MIRRORED, expectedDatabaseEnums } from "./enum-matrix.js";
import { parsePrismaEnums } from "./prisma-schema.js";

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

  it("every enum carries its PostgreSQL type name (@@map) and the matrix covers all of them", () => {
    for (const prismaEnum of prismaEnums) {
      expect(prismaEnum.dbName, `${prismaEnum.name} has no @@map`).not.toBe(prismaEnum.name);
    }
    const expected = expectedDatabaseEnums(prismaEnums);
    expect(Object.keys(expected)).toHaveLength(prismaEnums.length);
    expect(expected["opportunity_status"]).toEqual([
      "candidate",
      "selected",
      "dismissed",
      "expired",
    ]);
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
