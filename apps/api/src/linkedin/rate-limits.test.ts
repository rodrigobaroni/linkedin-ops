import { describe, expect, it } from "vitest";
import { ADR_0007_RATE_LIMITS } from "./rate-limits.js";

describe("LinkedIn rate limits", () => {
  it("match ADR-0007 item 10: connect 5/session, callback 20/IP, publish 3/user per 10 minutes", () => {
    expect(ADR_0007_RATE_LIMITS).toEqual({
      windowMs: 600_000,
      connectPerSession: 5,
      callbackPerIp: 20,
      publishPerUser: 3,
    });
  });
});
