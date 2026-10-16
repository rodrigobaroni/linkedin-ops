import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const SCHEMA_PATH = fileURLToPath(new URL("../prisma/schema.prisma", import.meta.url));

export interface PrismaEnumValue {
  /** Prisma/TypeScript name (`CODE_CARD`). */
  name: string;
  /** Value stored in PostgreSQL (`code-card` when `@map` is present, else the name). */
  dbValue: string;
}

export interface PrismaEnum {
  name: string;
  values: PrismaEnumValue[];
}

/** Minimal parser for `enum` blocks of a Prisma schema (enough for parity tests; no DMMF needed). */
export function parsePrismaEnums(schema: string = readFileSync(SCHEMA_PATH, "utf8")): PrismaEnum[] {
  const enums: PrismaEnum[] = [];
  const blockPattern = /^enum\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  for (const match of schema.matchAll(blockPattern)) {
    const [, name, body] = match as unknown as [string, string, string];
    const values: PrismaEnumValue[] = [];
    for (const rawLine of body.split("\n")) {
      const line = rawLine.trim();
      if (line === "" || line.startsWith("//") || line.startsWith("@@")) continue;
      const valueMatch = /^(\w+)(?:\s+@map\("([^"]+)"\))?/.exec(line);
      if (!valueMatch) throw new Error(`Unparseable enum line in ${name}: ${line}`);
      const [, valueName, mapped] = valueMatch;
      values.push({ name: valueName!, dbValue: mapped ?? valueName! });
    }
    enums.push({ name, values });
  }
  return enums;
}
