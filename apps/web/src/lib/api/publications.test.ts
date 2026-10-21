import { describe, expect, it } from "vitest";
import { type PublicationView, publicationUrl } from "./publications";

function publication(overrides: Partial<PublicationView>): PublicationView {
  return {
    id: "7d1f0a52-4a8e-4c38-9a0e-1f7f3e1c2b10",
    draftId: null,
    draftVersionId: null,
    text: "Post",
    scheduleId: null,
    status: "SUCCEEDED",
    attempt: 1,
    externalPostId: null,
    externalUrl: null,
    startedAt: null,
    finishedAt: null,
    publishedAt: null,
    error: null,
    createdAt: "2026-10-21T22:00:00.000Z",
    ...overrides,
  };
}

describe("publicationUrl", () => {
  it("uses externalUrl on LinkedIn's exact origin", () => {
    const url = "https://www.linkedin.com/feed/update/urn:li:share:7123/";
    expect(publicationUrl(publication({ externalUrl: url }))).toBe(url);
  });

  it("derives the feed URL from a share or ugcPost URN", () => {
    expect(publicationUrl(publication({ externalPostId: "urn:li:share:7123" }))).toBe(
      "https://www.linkedin.com/feed/update/urn:li:share:7123/",
    );
    expect(publicationUrl(publication({ externalPostId: "urn:li:ugcPost:42" }))).toBe(
      "https://www.linkedin.com/feed/update/urn:li:ugcPost:42/",
    );
  });

  it.each([
    "javascript:alert(document.cookie)",
    "https://evil.example/feed/update/urn:li:share:1/",
    "https://www.linkedin.com.evil.example/feed/",
    "https://linkedin.com/feed/update/urn:li:share:1/",
    "http://www.linkedin.com/feed/update/urn:li:share:1/",
    "https://www.linkedin.com:8443/feed/",
    "https://user@www.linkedin.com/feed/",
    "data:text/html,<script>alert(1)</script>",
    "//evil.example",
  ])("ignores the unsafe externalUrl %s and falls back to the URN", (externalUrl) => {
    expect(publicationUrl(publication({ externalUrl, externalPostId: "urn:li:share:7" }))).toBe(
      "https://www.linkedin.com/feed/update/urn:li:share:7/",
    );
    expect(publicationUrl(publication({ externalUrl }))).toBeNull();
  });

  it.each([
    "urn:li:person:abc",
    "urn:li:share:abc",
    "urn:li:share:1/../../x",
    "urn:li:organization:1",
  ])("does not link the URN %s", (externalPostId) => {
    expect(publicationUrl(publication({ externalPostId }))).toBeNull();
  });
});
