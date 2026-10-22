import type { TailorIssue } from "./career/feedback.js";

/** Success or failure without exceptions (ADR-0005 §2: `parse*Response → Result<T, EngineError>`). */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

export function err<E>(error: E): { ok: false; error: E } {
  return { ok: false, error };
}

/**
 * Why a model output was rejected. `issues` hold paths, ids and rule names only — never document content —
 * so they can be logged and stored (threat model TM-29).
 */
export interface EngineError {
  code: "SCHEMA_INVALID" | "SEMANTIC_INVALID";
  issues: string[];
  /**
   * The same issues, structured for the next attempt (`cv-tailor` only, issue #99). Their excerpts come from the
   * model's output: data for the next prompt, never logged.
   */
  feedback?: TailorIssue[];
}
