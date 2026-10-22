import { performance } from "node:perf_hooks";
import { afterAll, describe, expect, it } from "vitest";
import { buildPdf, fictitiousCvPdf, xObjectBombPdf } from "../../test/fixtures/pdf.js";
import { CvPdfBusyError, CvPdfError } from "./cv-pdf.js";
import { CvPdfExtractor, DEFAULT_CV_PDF_EXTRACTOR_LIMITS } from "./cv-pdf.extractor.js";

/**
 * Test deadlines. Each parse starts a cold thread (through the tsx loader in tests), which can take seconds
 * on a CI runner: legitimate PDFs get a deadline no runner reaches; the hostile tests assert lower bounds
 * and outcomes, never tight ceilings. Production stays DEFAULT_CV_PDF_EXTRACTOR_LIMITS (10 s, 128 MiB, 2).
 */
const LEGIT_TIMEOUT_MS = 60_000;
const HOSTILE_TIMEOUT_MS = 3_000;
const extractor = new CvPdfExtractor({
  ...DEFAULT_CV_PDF_EXTRACTOR_LIMITS,
  timeoutMs: LEGIT_TIMEOUT_MS,
});
afterAll(() => extractor.onApplicationShutdown());

async function reasonOf(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(CvPdfError);
  return (error as CvPdfError).reason;
}

describe("CvPdfExtractor (worker thread per upload, Sentinela S-1)", () => {
  it("extracts the text in a worker thread and leaves the caller's buffer intact", async () => {
    const file = fictitiousCvPdf("CANARIO-WORKER");
    const before = Buffer.from(file);
    expect(await extractor.extract(file)).toContain("CANARIO-WORKER");
    expect(file.equals(before)).toBe(true);
  });

  it("rejects a non-PDF without starting a thread", async () => {
    expect(await reasonOf(extractor.extract(Buffer.from("GIF89a")))).toBe("NOT_PDF");
  });

  it("rejects an encrypted PDF and a corrupt one as unreadable", async () => {
    expect(await reasonOf(extractor.extract(buildPdf({ pages: [["x"]], encrypted: true })))).toBe(
      "UNREADABLE",
    );
    expect(await reasonOf(extractor.extract(fictitiousCvPdf().subarray(0, 400)))).toBe(
      "UNREADABLE",
    );
  });

  it(
    "terminates an XObject bomb at the deadline while the event loop keeps running",
    async () => {
      const short = new CvPdfExtractor({
        ...DEFAULT_CV_PDF_EXTRACTOR_LIMITS,
        timeoutMs: HOSTILE_TIMEOUT_MS,
        maxConcurrent: 1,
      });
      try {
        const bomb = xObjectBombPdf();
        expect(bomb.length).toBeLessThan(10 * 1024);
        const started = performance.now();
        const parsing = reasonOf(short.extract(bomb));

        // The API thread stays free: timers keep firing during the parsing.
        const lags: number[] = [];
        for (let tick = 0; tick < 10; tick += 1) {
          const scheduled = performance.now();
          await new Promise((resolve) => setTimeout(resolve, 50));
          lags.push(performance.now() - scheduled - 50);
        }
        expect(Math.max(...lags)).toBeLessThan(500);

        expect(await parsing).toBe("TOO_COMPLEX");
        // Ended by the deadline (a timer never fires early)...
        expect(performance.now() - started).toBeGreaterThanOrEqual(HOSTILE_TIMEOUT_MS - 50);
        // ...and the thread is gone: its only slot is free again (not busy, whatever the outcome).
        const after = await short.extract(fictitiousCvPdf()).then(
          () => "parsed",
          (caught: unknown) => caught,
        );
        expect(after).not.toBeInstanceOf(CvPdfBusyError);
      } finally {
        await short.onApplicationShutdown();
      }
    },
    HOSTILE_TIMEOUT_MS + 60_000,
  );

  it("caps concurrent parsings and answers busy beyond the cap", async () => {
    const capped = new CvPdfExtractor({
      ...DEFAULT_CV_PDF_EXTRACTOR_LIMITS,
      timeoutMs: LEGIT_TIMEOUT_MS,
      maxConcurrent: 1,
      retryAfterSeconds: 7,
    });
    try {
      const first = capped.extract(fictitiousCvPdf());
      const second = await capped.extract(fictitiousCvPdf()).then(
        () => null,
        (caught: unknown) => caught,
      );
      expect(second).toBeInstanceOf(CvPdfBusyError);
      expect((second as CvPdfBusyError).retryAfterSeconds).toBe(7);
      await expect(first).resolves.toContain("Ana Exemplo");
      // The slot is free again once the first thread is done.
      await expect(capped.extract(fictitiousCvPdf())).resolves.toContain("Ana Exemplo");
    } finally {
      await capped.onApplicationShutdown();
    }
  }, 30_000);

  it("kills a thread that exceeds its memory budget, before its (unreachable) deadline", async () => {
    const budget = { maxOldGenerationSizeMb: 32, maxYoungGenerationSizeMb: 8, stackSizeMb: 4 };
    const deadlineMs = 150_000;
    const tight = new CvPdfExtractor({
      ...DEFAULT_CV_PDF_EXTRACTOR_LIMITS,
      timeoutMs: deadlineMs,
      resourceLimits: budget,
    });
    try {
      // A real CV fits the budget comfortably.
      await expect(tight.extract(fictitiousCvPdf())).resolves.toContain("Ana Exemplo");
      const started = performance.now();
      expect(await reasonOf(tight.extract(xObjectBombPdf()))).toBe("TOO_COMPLEX");
      // Rejected before the deadline could fire: the memory budget killed the thread, not the timer.
      expect(performance.now() - started).toBeLessThan(deadlineMs);
    } finally {
      await tight.onApplicationShutdown();
    }
  }, 180_000);
});
