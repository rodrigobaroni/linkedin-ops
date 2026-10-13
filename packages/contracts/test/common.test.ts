import { describe, expect, it } from "vitest";
import {
  ERROR_CODE_HTTP_STATUS,
  ErrorCodeSchema,
  IanaTimezoneSchema,
  IsoDateTimeSchema,
  LocalDateTimeSchema,
  isIanaTimezone,
  paginated,
  problemTypeFor,
} from "../src/index.js";
import { z } from "zod";

describe("datetime", () => {
  it("IsoDateTime requires a Z suffix and rejects offsets", () => {
    expect(IsoDateTimeSchema.safeParse("2026-10-13T11:00:00Z").success).toBe(true);
    expect(IsoDateTimeSchema.safeParse("2026-10-13T11:00:00.123Z").success).toBe(true);
    expect(IsoDateTimeSchema.safeParse("2026-10-13T11:00:00+00:00").success).toBe(false);
    expect(IsoDateTimeSchema.safeParse("2026-10-13T11:00:00").success).toBe(false);
    expect(IsoDateTimeSchema.safeParse("2026-10-13").success).toBe(false);
  });

  it("LocalDateTime is exactly YYYY-MM-DDTHH:mm with a real calendar date", () => {
    expect(LocalDateTimeSchema.safeParse("2026-10-15T09:00").success).toBe(true);
    expect(LocalDateTimeSchema.safeParse("2028-02-29T09:00").success).toBe(true);
    expect(LocalDateTimeSchema.safeParse("2026-02-29T09:00").success).toBe(false);
    expect(LocalDateTimeSchema.safeParse("2026-10-15T09:00:00").success).toBe(false);
    expect(LocalDateTimeSchema.safeParse("2026-10-15T24:00").success).toBe(false);
    expect(LocalDateTimeSchema.safeParse("2026-13-01T09:00").success).toBe(false);
  });

  it("IanaTimezone accepts IANA names (and UTC) and rejects offsets/abbreviations", () => {
    for (const tz of ["America/Sao_Paulo", "Europe/Lisbon", "UTC"])
      expect(IanaTimezoneSchema.safeParse(tz).success, tz).toBe(true);
    for (const tz of ["-03:00", "BRT", "Mars/Olympus", "", "america/sao_paulo"])
      expect(IanaTimezoneSchema.safeParse(tz).success, tz).toBe(false);
    expect(isIanaTimezone("Asia/Tokyo")).toBe(true);
  });
});

describe("problem details", () => {
  it("every error code has an HTTP status in the documented ranges", () => {
    for (const code of ErrorCodeSchema.options) {
      const status = ERROR_CODE_HTTP_STATUS[code];
      expect(status, code).toBeGreaterThanOrEqual(400);
      expect(status, code).toBeLessThan(600);
    }
    expect(ERROR_CODE_HTTP_STATUS.VALIDATION_FAILED).toBe(400);
    expect(ERROR_CODE_HTTP_STATUS.DRAFT_INVALID_TRANSITION).toBe(409);
    expect(ERROR_CODE_HTTP_STATUS.LINKEDIN_REAUTH_REQUIRED).toBe(412);
    expect(ERROR_CODE_HTTP_STATUS.SCHEDULE_IN_PAST).toBe(422);
    expect(ERROR_CODE_HTTP_STATUS.RATE_LIMITED).toBe(429);
  });

  it("builds the problem type URI from the code", () => {
    expect(problemTypeFor("DRAFT_INVALID_TRANSITION")).toBe(
      "https://linkedin-ops.local/errors/draft-invalid-transition",
    );
  });
});

describe("pagination", () => {
  it("wraps items with a nullable cursor", () => {
    const page = paginated(z.object({ id: z.string() }));
    expect(page.safeParse({ items: [{ id: "a" }], nextCursor: null }).success).toBe(true);
    expect(page.safeParse({ items: [{ id: "a" }] }).success).toBe(false);
    expect(page.safeParse({ items: "nope", nextCursor: null }).success).toBe(false);
  });
});
