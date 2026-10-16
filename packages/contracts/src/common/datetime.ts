import { z } from "zod";

/**
 * Instant in UTC, ISO 8601 with a mandatory `Z` suffix (`2026-10-13T11:00:00Z`).
 * Offsets are rejected on purpose: local time only travels together with an IANA timezone.
 */
export const IsoDateTimeSchema = z.iso
  .datetime({ offset: false, local: false })
  .describe("ISO 8601 UTC instant with Z suffix");
export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;

/** Calendar date `YYYY-MM-DD`. */
export const IsoDateSchema = z.iso.date().describe("ISO 8601 calendar date");
export type IsoDate = z.infer<typeof IsoDateSchema>;

/** Wall-clock time `HH:mm` (quiet hours). */
export const TimeOfDaySchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Expected HH:mm")
  .describe("Wall-clock time HH:mm");
export type TimeOfDay = z.infer<typeof TimeOfDaySchema>;

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function isValidLocalDateTime(value: string): boolean {
  const match = LOCAL_DATE_TIME.exec(value);
  if (!match) return false;
  const [, y, mo, d, h, mi] = match.map(Number) as [number, number, number, number, number, number];
  if (mo < 1 || mo > 12 || h > 23 || mi > 59) return false;
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return d >= 1 && d <= daysInMonth;
}

/**
 * Local wall-clock date-time without offset (`2026-10-15T09:00`), always paired with an `IanaTimezone`.
 * Exactly `YYYY-MM-DDTHH:mm`; seconds and offsets are rejected.
 */
export const LocalDateTimeSchema = z
  .string()
  .regex(LOCAL_DATE_TIME, "Expected YYYY-MM-DDTHH:mm without offset")
  .refine(isValidLocalDateTime, "Invalid calendar date or time")
  .describe("Local date-time YYYY-MM-DDTHH:mm (no offset)");
export type LocalDateTime = z.infer<typeof LocalDateTimeSchema>;

const SUPPORTED_TIME_ZONES: ReadonlySet<string> = new Set([
  ...Intl.supportedValuesOf("timeZone"),
  "UTC",
]);

/** True when `value` is an IANA timezone known to the runtime (plus `UTC`). */
export function isIanaTimezone(value: string): boolean {
  return SUPPORTED_TIME_ZONES.has(value);
}

/** IANA timezone name (`America/Sao_Paulo`). Validated with `Intl.supportedValuesOf("timeZone")`. */
export const IanaTimezoneSchema = z
  .string()
  .refine(isIanaTimezone, "Expected an IANA timezone name")
  .describe("IANA timezone name");
export type IanaTimezone = z.infer<typeof IanaTimezoneSchema>;

/** Local date-time + timezone pair. The only way a wall-clock time appears in the API. */
export const LocalSlotSchema = z
  .object({
    localDateTime: LocalDateTimeSchema,
    timezone: IanaTimezoneSchema,
  })
  .meta({ id: "LocalSlot" });
export type LocalSlot = z.infer<typeof LocalSlotSchema>;
