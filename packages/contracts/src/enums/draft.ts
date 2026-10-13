import { z } from "zod";

/** Draft lifecycle (data-model.md §2.5, §3). */
export const DraftStatusSchema = z
  .enum([
    "GENERATING",
    "DRAFT",
    "IN_REVIEW",
    "APPROVED",
    "SCHEDULED",
    "PUBLISHING",
    "PUBLISHED",
    "FAILED",
    "DISCARDED",
  ])
  .meta({ id: "DraftStatus" });
export const DraftStatus = DraftStatusSchema.enum;
export type DraftStatus = z.infer<typeof DraftStatusSchema>;

/** Who authored a draft version: regenerate = SYSTEM, manual edit = USER. */
export const DraftVersionAuthorTypeSchema = z
  .enum(["SYSTEM", "USER"])
  .meta({ id: "DraftVersionAuthorType" });
export const DraftVersionAuthorType = DraftVersionAuthorTypeSchema.enum;
export type DraftVersionAuthorType = z.infer<typeof DraftVersionAuthorTypeSchema>;

/** Hook formulas from the editorial system (docs/editorial/structured-outputs.md §1.1). */
export const HookFormulaSchema = z
  .enum([
    "H00",
    "H01",
    "H02",
    "H03",
    "H04",
    "H05",
    "H07",
    "H08",
    "H09",
    "H10",
    "H11",
    "H12",
    "H14",
    "H15",
    "H16",
    "H17",
    "H18",
    "H19",
    "H20",
  ])
  .meta({ id: "HookFormula" });
export const HookFormula = HookFormulaSchema.enum;
export type HookFormula = z.infer<typeof HookFormulaSchema>;
