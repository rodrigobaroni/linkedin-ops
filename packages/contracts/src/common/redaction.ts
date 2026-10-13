import { z } from "zod";

/**
 * Keys that must never appear in anything the API returns or persists as a snapshot (data-model.md I10,
 * threat model TM-04). Shared by the audit snapshot schema and the contract tests.
 */
export const SENSITIVE_KEY_PATTERN =
  /token|secret|passw(or)?d|passphrase|api[-_]?key|private[-_]?key|ciphertext|authorization|cookie|credential/i;

/** Keys that match the pattern but carry counts, never credentials. */
export const SENSITIVE_KEY_ALLOWLIST: ReadonlySet<string> = new Set([
  "inputTokens",
  "outputTokens",
]);

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key) && !SENSITIVE_KEY_ALLOWLIST.has(key);
}

export const REDACTED_JSON_MAX_DEPTH = 8;
export const REDACTED_JSON_MAX_STRING = 4000;
export const REDACTED_JSON_MAX_ITEMS = 200;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

const SafeKeySchema = z
  .string()
  .max(128)
  .refine((key) => !isSensitiveKey(key), { message: "Sensitive key is not allowed in a snapshot" });

/**
 * JSON value whose object keys are rejected (recursively) when they look like a credential. Redaction must
 * happen before persisting; this schema makes an un-redacted snapshot fail validation instead of leaking.
 */
export const RedactedJsonValueSchema: z.ZodType<JsonValue> = z
  .lazy(() =>
    z.union([
      z.string().max(REDACTED_JSON_MAX_STRING),
      z.number(),
      z.boolean(),
      z.null(),
      z.array(RedactedJsonValueSchema).max(REDACTED_JSON_MAX_ITEMS),
      z.record(SafeKeySchema, RedactedJsonValueSchema),
    ]),
  )
  .meta({ id: "RedactedJson" });

function depthOf(value: JsonValue, current = 1): number {
  if (value === null || typeof value !== "object") return current;
  const children = Array.isArray(value) ? value : Object.values(value);
  return children.reduce<number>(
    (max, child) => Math.max(max, depthOf(child, current + 1)),
    current,
  );
}

/** Object form used by `AuditEvent.before/after`: redacted keys, bounded depth and size. */
export const RedactedJsonObjectSchema = z
  .record(SafeKeySchema, RedactedJsonValueSchema)
  .refine((value) => depthOf(value) <= REDACTED_JSON_MAX_DEPTH, {
    message: `Snapshot nesting deeper than ${REDACTED_JSON_MAX_DEPTH}`,
  })
  .refine((value) => Object.keys(value).length <= REDACTED_JSON_MAX_ITEMS, {
    message: `Snapshot has more than ${REDACTED_JSON_MAX_ITEMS} keys`,
  });
export type RedactedJsonObject = z.infer<typeof RedactedJsonObjectSchema>;
