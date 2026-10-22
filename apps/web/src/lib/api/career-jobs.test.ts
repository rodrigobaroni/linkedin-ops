import { describe, expect, it } from "vitest";
import { JOBS_POLL, jobDomain, jobsPollDelayMs, parseJobLinks } from "./career-jobs";

describe("parseJobLinks", () => {
  it("one link per line, trimmed, blank lines ignored", () => {
    const parsed = parseJobLinks(
      "  https://www.linkedin.com/jobs/view/123 \n\n\r\nhttps://empresa.com/vagas/1\n",
    );
    expect(parsed.urls).toEqual([
      "https://www.linkedin.com/jobs/view/123",
      "https://empresa.com/vagas/1",
    ]);
    expect(parsed.invalidLines).toEqual([]);
  });

  it("flags, by position among the links, what the contract refuses", () => {
    const parsed = parseJobLinks(
      [
        "https://empresa.com/vagas/1",
        "empresa.com/vagas/2",
        "ftp://empresa.com/vaga",
        "https://user:senha@empresa.com/vaga",
        "http://192.168.0.1/vaga",
        "javascript:alert(1)",
      ].join("\n"),
    );
    expect(parsed.invalidLines).toEqual([2, 3, 4, 5, 6]);
  });

  it("an empty field has no links", () => {
    expect(parseJobLinks(" \n \n")).toEqual({ urls: [], invalidLines: [] });
  });
});

describe("jobDomain", () => {
  it("host without www; the raw text when it is not a URL", () => {
    expect(jobDomain("https://www.linkedin.com/jobs/view/1")).toBe("linkedin.com");
    expect(jobDomain("https://vagas.empresa.com.br/a?b=c")).toBe("vagas.empresa.com.br");
    expect(jobDomain("não é url")).toBe("não é url");
  });
});

describe("jobsPollDelayMs", () => {
  it("starts at 3 s and backs off ×1.5 up to 15 s", () => {
    expect(jobsPollDelayMs(0)).toBe(3_000);
    expect(jobsPollDelayMs(1)).toBe(4_500);
    expect(jobsPollDelayMs(4)).toBe(JOBS_POLL.maxMs);
    expect(jobsPollDelayMs(40)).toBe(JOBS_POLL.maxMs);
  });
});
