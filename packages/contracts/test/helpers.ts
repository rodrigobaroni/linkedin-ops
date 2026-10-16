import type { z } from "zod";

export const DELETE = Symbol("delete");

export interface SchemaCase {
  name: string;
  schema: z.ZodType;
  valid: unknown;
  /** Label → mutation of the valid fixture that must be rejected. At least two per schema. */
  invalid: Record<string, (valid: unknown) => unknown>;
}

/** Returns a deep copy of `value` with `path` ("a.b.0.c") set to `replacement` (or removed with DELETE). */
export function patch(value: unknown, path: string, replacement: unknown): unknown {
  const copy = structuredClone(value) as Record<string, unknown>;
  const segments = path.split(".");
  let cursor: Record<string, unknown> = copy;
  for (const segment of segments.slice(0, -1)) {
    cursor = cursor[segment] as Record<string, unknown>;
  }
  const last = segments[segments.length - 1] as string;
  if (replacement === DELETE) {
    if (Array.isArray(cursor)) cursor.splice(Number(last), 1);
    else delete cursor[last];
  } else {
    cursor[last] = replacement;
  }
  return copy;
}

/** Shorthand mutation builders. */
export const set = (path: string, value: unknown) => (valid: unknown) => patch(valid, path, value);
export const drop = (path: string) => (valid: unknown) => patch(valid, path, DELETE);
export const replace = (value: unknown) => () => value;

export function repeat(char: string, length: number): string {
  return char.repeat(length);
}
