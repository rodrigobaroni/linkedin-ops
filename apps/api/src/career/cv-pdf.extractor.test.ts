import { performance } from "node:perf_hooks";
import { afterAll, describe, expect, it } from "vitest";
import { buildPdf, fictitiousCvPdf, xObjectBombPdf } from "../../test/fixtures/pdf.js";
import { CvPdfBusyError, CvPdfError } from "./cv-pdf.js";
import { CvPdfExtractor, DEFAULT_CV_PDF_EXTRACTOR_LIMITS } from "./cv-pdf.extractor.js";

/** Deadline for the tests: a cold worker (tsx loader + pdf.js) reads a CV in ~150 ms; a bomb never ends. */
const TIMEOUT_MS = 2_000;
const extractor = new CvPdfExtractor({ ...DEFAULT_CV_PDF_EXTRACTOR_LIMITS, timeoutMs: TIMEOUT_MS });
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
      const bomb = xObjectBombPdf();
      expect(bomb.length).toBeLessThan(10 * 1024);
      const started = performance.now();
      const parsing = reasonOf(extractor.extract(bomb));

      // The API thread stays free: timers keep firing on time during the parsing.
      const lags: number[] = [];
      for (let tick = 0; tick < 10; tick += 1) {
        const scheduled = performance.now();
        await new Promise((resolve) => setTimeout(resolve, 50));
        lags.push(performance.now() - scheduled - 50);
      }
      expect(Math.max(...lags)).toBeLessThan(200);

      expect(await parsing).toBe("TOO_COMPLEX");
      const elapsed = performance.now() - started;
      expect(elapsed).toBeGreaterThanOrEqual(TIMEOUT_MS - 50);
      expect(elapsed).toBeLessThan(TIMEOUT_MS + 1_000);
    },
    TIMEOUT_MS + 10_000,
  );

  it("caps concurrent parsings and answers busy beyond the cap", async () => {
    const capped = new CvPdfExtractor({
      ...DEFAULT_CV_PDF_EXTRACTOR_LIMITS,
      timeoutMs: TIMEOUT_MS,
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

  it("kills a thread that exceeds its memory budget, long before the deadline", async () => {
    const budget = { maxOldGenerationSizeMb: 32, maxYoungGenerationSizeMb: 8, stackSizeMb: 4 };
    const tight = new CvPdfExtractor({
      ...DEFAULT_CV_PDF_EXTRACTOR_LIMITS,
      timeoutMs: 60_000,
      resourceLimits: budget,
    });
    try {
      // A real CV fits the budget comfortably.
      await expect(tight.extract(fictitiousCvPdf())).resolves.toContain("Ana Exemplo");
      const started = performance.now();
      expect(await reasonOf(tight.extract(xObjectBombPdf()))).toBe("TOO_COMPLEX");
      expect(performance.now() - started).toBeLessThan(30_000);
    } finally {
      await tight.onApplicationShutdown();
    }
  }, 70_000);
});
