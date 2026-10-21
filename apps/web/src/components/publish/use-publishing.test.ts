import { describe, expect, it } from "vitest";
import { MOCK_AUTHORIZE_URL } from "@/mocks/publishing-handlers";
import { isLinkedInAuthorizeUrl } from "./use-publishing";

describe("isLinkedInAuthorizeUrl", () => {
  it("accepts LinkedIn's OAuth authorization endpoint", () => {
    expect(isLinkedInAuthorizeUrl(MOCK_AUTHORIZE_URL)).toBe(true);
    expect(isLinkedInAuthorizeUrl("https://www.linkedin.com:443/oauth/v2/authorization?x=1")).toBe(
      true,
    );
  });

  it.each([
    ["bare host", "https://linkedin.com/oauth/v2/authorization?state=s"],
    ["custom port", "https://www.linkedin.com:8443/oauth/v2/authorization?state=s"],
    ["other path", "https://www.linkedin.com/feed/"],
    ["path prefix", "https://www.linkedin.com/oauth/v2/authorization/../../evil"],
    ["path suffix", "https://www.linkedin.com/oauth/v2/authorizationx"],
    ["http", "http://www.linkedin.com/oauth/v2/authorization?state=s"],
    ["javascript:", "javascript:alert(document.cookie)"],
    ["lookalike host", "https://www.linkedin.com.evil.example/oauth/v2/authorization"],
    ["userinfo", "https://user:pass@www.linkedin.com/oauth/v2/authorization"],
    ["subdomain", "https://evil.www.linkedin.com/oauth/v2/authorization"],
    ["relative", "/oauth/v2/authorization"],
    ["garbage", "not a url"],
  ])("rejects %s", (_label, value) => {
    expect(isLinkedInAuthorizeUrl(value)).toBe(false);
  });
});
