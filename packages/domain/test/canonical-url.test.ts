import { describe, expect, it } from "vitest";
import { canonicalizeUrl, isTrackingParameter } from "../src/sources/canonical-url.js";

describe("canonicalizeUrl", () => {
  it("lowercases scheme and host, drops fragment and default port", () => {
    expect(canonicalizeUrl("HTTPS://Blog.Example.COM:443/Post#section")).toBe(
      "https://blog.example.com/Post",
    );
  });

  it("removes tracking parameters but keeps meaningful ones, sorted", () => {
    expect(
      canonicalizeUrl(
        "https://example.com/feed?utm_source=x&page=2&fbclid=abc&category=dev&UTM_Medium=y&gclid=1",
      ),
    ).toBe("https://example.com/feed?category=dev&page=2");
  });

  it("keeps a query made only of real parameters and yields no trailing '?' when empty", () => {
    expect(canonicalizeUrl("https://example.com/search?q=prisma")).toBe(
      "https://example.com/search?q=prisma",
    );
    expect(canonicalizeUrl("https://example.com/path?utm_campaign=c")).toBe(
      "https://example.com/path",
    );
  });

  it("is idempotent", () => {
    const once = canonicalizeUrl("https://Example.com/a?b=1&utm_x=2#h");
    expect(canonicalizeUrl(once)).toBe(once);
  });

  it("throws on an invalid URL", () => {
    expect(() => canonicalizeUrl("not a url")).toThrow(TypeError);
  });
});

describe("isTrackingParameter", () => {
  it("matches known names and prefixes case-insensitively", () => {
    expect(isTrackingParameter("utm_source")).toBe(true);
    expect(isTrackingParameter("UTM_Term")).toBe(true);
    expect(isTrackingParameter("mc_eid")).toBe(true);
    expect(isTrackingParameter("page")).toBe(false);
    expect(isTrackingParameter("id")).toBe(false);
  });
});
