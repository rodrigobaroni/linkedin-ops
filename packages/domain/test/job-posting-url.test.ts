import { describe, expect, it } from "vitest";
import {
  isFetchableJobPostingUrl,
  jobPostingSourceOf,
  jobPostingUrlHash,
  normalizeJobPostingUrl,
} from "../src/career/job-posting-url.js";

describe("normalizeJobPostingUrl", () => {
  it("reduces every LinkedIn job link to /jobs/view/<id>/ without query", () => {
    const canonical = "https://www.linkedin.com/jobs/view/4012345678/";
    for (const raw of [
      "https://www.linkedin.com/jobs/view/4012345678",
      "https://linkedin.com/jobs/view/4012345678/?trk=public_jobs&refId=abc%3D%3D&trackingId=xyz",
      "https://BR.LinkedIn.com/jobs/view/senior-backend-engineer-at-fictional-corp-4012345678?utm_source=x",
      "https://www.linkedin.com/jobs/search/?currentJobId=4012345678&geoId=106057199&keywords=backend",
      "https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4012345678#top",
      "https://www.linkedin.com:443/jobs/view/4012345678/?eBP=abc&lipi=urn%3Ali",
      "https://www.linkedin.com/JOBS/VIEW/4012345678",
      "https://www.linkedin.com/Jobs/View/Senior-Engineer-at-Corp-4012345678//",
      "https://www.linkedin.com//jobs//view//4012345678///",
    ]) {
      expect(normalizeJobPostingUrl(raw), raw).toBe(canonical);
    }
  });

  it("drops every query parameter of other LinkedIn paths (the fetcher fails them as permanent)", () => {
    expect(
      normalizeJobPostingUrl("https://www.linkedin.com/in/fulano/?trk=x&currentJobId=abc"),
    ).toBe("https://www.linkedin.com/in/fulano/");
    expect(normalizeJobPostingUrl("https://www.linkedin.com/jobs/search/?keywords=backend")).toBe(
      "https://www.linkedin.com/jobs/search/",
    );
  });

  it("keeps the path of a shortener, without fragment", () => {
    expect(normalizeJobPostingUrl("https://lnkd.in/dAbC123?trk=share#x")).toBe(
      "https://lnkd.in/dAbC123",
    );
  });

  it("drops tracking parameters and the fragment of other sites, keeping and sorting the rest", () => {
    expect(
      normalizeJobPostingUrl(
        "HTTPS://Acme.Gupy.io:443/jobs/123?jobBoardSource=linkedin&utm_campaign=x&b=2&a=1#apply",
      ),
    ).toBe("https://acme.gupy.io/jobs/123?a=1&b=2");
    expect(
      normalizeJobPostingUrl("https://boards.greenhouse.io/acme/jobs/42?gh_src=abc&gh_jid=42"),
    ).toBe("https://boards.greenhouse.io/acme/jobs/42?gh_jid=42");
    expect(
      normalizeJobPostingUrl(
        "https://jobs.lever.co/acme/uuid?lever-source=LinkedIn&ref=x&fbclid=y",
      ),
    ).toBe("https://jobs.lever.co/acme/uuid");
  });

  it("never keeps credentials and drops the default port", () => {
    expect(normalizeJobPostingUrl("http://user:secret@example.test:80/job")).toBe(
      "http://example.test/job",
    );
  });

  it("is idempotent and merges equivalent links under one hash", () => {
    const a = normalizeJobPostingUrl("https://www.linkedin.com/jobs/view/1/?trk=a");
    const b = normalizeJobPostingUrl("https://linkedin.com/jobs/search/?currentJobId=1");
    expect(normalizeJobPostingUrl(a)).toBe(a);
    expect(jobPostingUrlHash(a)).toBe(jobPostingUrlHash(b));
    expect(jobPostingUrlHash(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("jobPostingSourceOf", () => {
  it("classifies LinkedIn, its shortener and other sites", () => {
    expect(jobPostingSourceOf("https://www.linkedin.com/jobs/view/1/")).toBe("LINKEDIN");
    expect(jobPostingSourceOf("https://lnkd.in/abc")).toBe("LINKEDIN");
    expect(jobPostingSourceOf("https://acme.gupy.io/jobs/1")).toBe("OTHER");
    expect(jobPostingSourceOf("https://notlinkedin.com/jobs/view/1")).toBe("OTHER");
  });
});

describe("isFetchableJobPostingUrl (ADR-0008 §1)", () => {
  it("fetches only LinkedIn job views, shorteners and other sites", () => {
    const fetchable = (raw: string) => isFetchableJobPostingUrl(normalizeJobPostingUrl(raw));
    expect(fetchable("https://www.linkedin.com/jobs/view/1/")).toBe(true);
    expect(fetchable("https://www.linkedin.com/JOBS/view/1")).toBe(true);
    expect(fetchable("https://www.linkedin.com/jobs/search/?currentJobId=1")).toBe(true);
    expect(fetchable("https://lnkd.in/abc")).toBe(true);
    expect(fetchable("https://acme.gupy.io/jobs/1")).toBe(true);
    for (const raw of [
      "https://www.linkedin.com/in/fulano/",
      "https://www.linkedin.com/feed/",
      "https://www.linkedin.com/jobs/search/?keywords=backend",
      "https://www.linkedin.com/jobs/view/abc/",
      "https://www.linkedin.com/company/acme/jobs/",
    ]) {
      expect(fetchable(raw), raw).toBe(false);
    }
  });
});
