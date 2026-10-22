/**
 * QA #104: hostile markup must never block the worker's event loop nor spend a new fetch. Extraction runs in a
 * worker thread with a hard timeout, behind a linear pre-scan with element and depth ceilings; any failure is
 * `unreadable` (the fetcher maps it to `permanent`, paste-text, no retry).
 */
import { describe, expect, it } from "vitest";
import { extractJobPageText } from "../src/career/job-page-text.js";
import { extractJobPageTextIsolated } from "../src/career/job-page-text-runner.js";

const KB = 1024;
const MB = 1024 * KB;

/** Runs `work` while sampling the event loop every 20 ms; returns the result, the duration and the worst gap. */
async function measured<T>(work: () => Promise<T>) {
  let last = performance.now();
  let worstGapMs = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    worstGapMs = Math.max(worstGapMs, now - last);
    last = now;
  }, 20);
  const started = performance.now();
  try {
    const result = await work();
    return { result, durationMs: performance.now() - started, worstGapMs };
  } finally {
    clearInterval(timer);
  }
}

const repeatTo = (unit: string, bytes: number) => unit.repeat(Math.ceil(bytes / unit.length));

describe("job page extraction under hostile markup (QA #104)", () => {
  it.each([
    ["512 KB of nested <div>", repeatTo("<div>", 512 * KB)],
    ["2 MB of nested <div>", repeatTo("<div>", 2 * MB)],
    ["64 KB of nested <span>", repeatTo("<span>", 64 * KB)],
    ["2 MB of nested <a>", repeatTo("<a>", 2 * MB)],
    ["2 MB of nested tables", repeatTo("<table><tr><td>", 2 * MB)],
    ["2 MB of <div> with unmatched closers", repeatTo("<div></span>", 2 * MB)],
    ["2 MB of self-closed <div/>", repeatTo("<div/>", 2 * MB)],
    ["2 MB of '<a' without '>'", repeatTo("<a ", 2 * MB)],
    [
      "nested markup inside a JSON-LD description",
      `<script type="application/ld+json">${JSON.stringify({
        "@type": "JobPosting",
        description: repeatTo("<div>", 180 * KB),
      })}</script><main>${"Vaga real. ".repeat(40)}</main>`,
    ],
  ])(
    "%s: ends in < 6 s without blocking the event loop",
    async (_name, body) => {
      const { result, durationMs, worstGapMs } = await measured(() =>
        extractJobPageTextIsolated(body, "text/html"),
      );
      expect(durationMs).toBeLessThan(6_000);
      expect(worstGapMs).toBeLessThan(500);
      expect(["unreadable", "empty", "text"]).toContain(result.kind);
    },
    15_000,
  );

  it("deep nesting is refused as unreadable, never a RangeError", async () => {
    expect(await extractJobPageTextIsolated(repeatTo("<div>", 64 * KB), "text/html")).toEqual({
      kind: "unreadable",
    });
    expect(extractJobPageText(repeatTo("<div>", 64 * KB), "text/html")).toEqual({
      kind: "unreadable",
    });
  });

  it("too many elements is refused as unreadable", () => {
    expect(extractJobPageText(repeatTo("<br>", 2 * MB), "text/html")).toEqual({
      kind: "unreadable",
    });
  });

  it("a hard timeout terminates the worker", async () => {
    const body = `<main>${"<p>Requisitos da vaga e responsabilidades.</p>".repeat(20_000)}</main>`;
    const { result, durationMs } = await measured(() =>
      extractJobPageTextIsolated(body, "text/html", { timeoutMs: 1 }),
    );
    expect(result).toEqual({ kind: "unreadable" });
    expect(durationMs).toBeLessThan(2_000);
  });

  it("an ordinary page still extracts through the worker", async () => {
    const body = `<html><body><nav>menu</nav><main><h1>Vaga</h1><p>${"Texto da vaga. ".repeat(30)}</p></main></body></html>`;
    const result = await extractJobPageTextIsolated(body, "text/html");
    expect(result.kind).toBe("text");
    expect(result.kind === "text" && result.text).toContain("Texto da vaga.");
    expect(result.kind === "text" && result.text).not.toContain("menu");
  });

  it("legitimate depth (tables and lists inside main) is not refused", () => {
    const nested = "<div><section><article><table><tbody><tr><td><ul><li><p><span><b>".repeat(8);
    const html = `<main>${nested}${"Requisitos da vaga. ".repeat(20)}</main>`;
    expect(extractJobPageText(html, "text/html").kind).toBe("text");
  });
});
