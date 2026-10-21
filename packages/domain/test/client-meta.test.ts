import { describe, expect, it } from "vitest";
import { minimizeIp, truncateUserAgent, USER_AGENT_MAX_LENGTH } from "../src/auth/client-meta.js";

describe("minimizeIp (data-and-lgpd.md)", () => {
  it.each([
    ["203.0.113.77", "203.0.113.0"],
    ["::ffff:203.0.113.77", "203.0.113.0"],
    ["2001:db8:abcd:12:34::1", "2001:db8:abcd::"],
    ["2001:db8::1", "2001:db8:0::"],
    ["::1", "0:0:0::"],
  ])("%s → %s", (input, expected) => {
    expect(minimizeIp(input)).toBe(expected);
  });

  it.each([undefined, "", "not-an-ip", "999.1.1.1"])("does not store %s", (input) => {
    expect(minimizeIp(input)).toBeNull();
  });
});

describe("truncateUserAgent", () => {
  it("keeps at most the contract length", () => {
    expect(truncateUserAgent("x".repeat(2_000))).toHaveLength(USER_AGENT_MAX_LENGTH);
    expect(truncateUserAgent(undefined)).toBeNull();
  });
});
