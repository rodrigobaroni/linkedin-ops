/**
 * Structured issues of a rejected `cv-tailor` output, fed back to the next attempt (issue #99, Pena
 * cv-tailor-1.1.0.md §4). The string issues of `EngineError` stay for logs and stored reasons; these carry a code,
 * where, and the offending words as the check found them in the model's own output.
 */
export type TailorIssueCode =
  | "schema_invalid"
  | "target_language_mismatch"
  | "requirement_unknown"
  | "requirement_not_assessed"
  | "ids_missing"
  | "ids_unknown"
  | "ids_duplicate"
  | "base_item_unknown"
  | "new_entity"
  | "title_from_credential"
  | "added_number"
  | "added_credential"
  | "credential_not_in_cited_items"
  | "number_not_in_cited_items"
  | "invented_role_title"
  | "invented_role_label";

export interface TailorIssue {
  code: TailorIssueCode;
  /** Segment or section the issue is about (`seg-3`, `experiences`, `matchAssessment`, `(root)`). */
  where: string;
  /**
   * The offending words exactly as the check found them in the model's own output (folded and trimmed), never
   * base CV or posting text the output did not contain. Absent for structural codes. Never logged.
   */
  excerpt?: string;
}

/** Lowercase, without diacritics: the folding of the role and entity checks. */
function folded(text: string): string {
  return text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * `candidate` when it occurs (folded) in `output`, the model's own text; otherwise nothing, so an excerpt can
 * never carry words the output did not contain.
 */
export function excerptFrom(output: string, candidate: string | undefined): string | undefined {
  const trimmed = candidate?.trim();
  if (!trimmed) return undefined;
  return folded(output).includes(folded(trimmed)) ? trimmed : undefined;
}
