import { describe, expect, it } from "vitest";
import {
  JOB_POSTING_LIMITS,
  JobPostingListQuerySchema,
  JobPostingTextInputSchema,
  TailoringBatchInputSchema,
} from "../src/index.js";

const link = (n: number) => `https://www.linkedin.com/jobs/view/${n}/`;

describe("TailoringBatchInput (career PR 3b, spec §7 and §9)", () => {
  it("accepts 1 to 20 links and refuses 0 or 21", () => {
    expect(TailoringBatchInputSchema.safeParse({ urls: [link(1)] }).success).toBe(true);
    const twenty = Array.from({ length: JOB_POSTING_LIMITS.maxLinks }, (_, i) => link(i));
    expect(TailoringBatchInputSchema.safeParse({ urls: twenty }).success).toBe(true);
    expect(TailoringBatchInputSchema.safeParse({ urls: [] }).success).toBe(false);
    expect(TailoringBatchInputSchema.safeParse({ urls: [...twenty, link(99)] }).success).toBe(
      false,
    );
  });

  it("accepts http(s) links with a domain, trimmed; duplicates are left to the server", () => {
    const parsed = TailoringBatchInputSchema.parse({
      urls: ["  https://acme.gupy.io/jobs/1  ", "http://example.com/job", link(1), link(1)],
    });
    expect(parsed.urls[0]).toBe("https://acme.gupy.io/jobs/1");
    expect(parsed.urls).toHaveLength(4);
  });

  it.each([
    ["ftp", "ftp://example.com/job"],
    ["javascript", "javascript:alert(1)"],
    ["IP literal", "http://169.254.169.254/latest/meta-data"],
    ["IPv6 literal", "http://[::1]/job"],
    ["localhost", "http://localhost:8080/job"],
    ["credentials", "https://user:secret@example.com/job"],
    ["relative", "/jobs/view/1"],
    ["too long", `https://example.com/${"a".repeat(JOB_POSTING_LIMITS.maxUrlChars)}`],
  ])("refuses %s links", (_label, url) => {
    expect(TailoringBatchInputSchema.safeParse({ urls: [url] }).success).toBe(false);
  });

  it("is strict", () => {
    expect(TailoringBatchInputSchema.safeParse({ urls: [link(1)], cvBaseId: "x" }).success).toBe(
      false,
    );
  });
});

describe("JobPostingTextInput", () => {
  it("bounds the pasted text after trimming and refuses NUL", () => {
    const ok = "x".repeat(JOB_POSTING_LIMITS.minTextChars);
    expect(JobPostingTextInputSchema.safeParse({ text: ok }).success).toBe(true);
    expect(JobPostingTextInputSchema.safeParse({ text: `   ${ok.slice(1)}   ` }).success).toBe(
      false,
    );
    expect(
      JobPostingTextInputSchema.safeParse({ text: "x".repeat(JOB_POSTING_LIMITS.maxTextChars + 1) })
        .success,
    ).toBe(false);
    expect(JobPostingTextInputSchema.safeParse({ text: `${ok}\u0000` }).success).toBe(false);
  });
});

describe("JobPostingListQuery", () => {
  it("takes a uuid cursor and the standard limit", () => {
    expect(JobPostingListQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(JobPostingListQuerySchema.safeParse({ cursor: "not-a-uuid" }).success).toBe(false);
    expect(JobPostingListQuerySchema.safeParse({ status: "READY" }).success).toBe(false);
  });
});
