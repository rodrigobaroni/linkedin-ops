import { Worker } from "node:worker_threads";
import type { OnApplicationShutdown } from "@nestjs/common";
import { CvPdfBusyError, CvPdfError, hasPdfSignature } from "./cv-pdf.js";
import type { CvPdfWorkerResult } from "./cv-pdf.worker.js";

/** Injection token of the PDF text extractor (tests shorten its deadline). */
export const CV_PDF_EXTRACTOR = Symbol("CV_PDF_EXTRACTOR");

export interface CvPdfExtractorLimits {
  /** Wall-clock deadline of one parsing thread, then `worker.terminate()`. */
  timeoutMs: number;
  /** Parsing threads alive at once; beyond it the upload gets `503` + `Retry-After`. */
  maxConcurrent: number;
  retryAfterSeconds: number;
  /** V8 heap budget of each thread (`resourceLimits`); overflow kills the thread, not the API. */
  resourceLimits: {
    maxOldGenerationSizeMb: number;
    maxYoungGenerationSizeMb: number;
    stackSizeMb: number;
  };
}

/** Sentinela S-1 (PR #88): 10 s, two at once, 128 MiB of old generation per thread. */
export const DEFAULT_CV_PDF_EXTRACTOR_LIMITS: Readonly<CvPdfExtractorLimits> = {
  timeoutMs: 10_000,
  maxConcurrent: 2,
  retryAfterSeconds: 5,
  resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 },
};

/**
 * Compiled API: `dist/career/cv-pdf.worker.js`. From source (`tsx` in development, Vitest), the TypeScript
 * entry is loaded through tsx's loader, a devDependency present wherever source runs.
 */
function workerEntry(): { url: URL; execArgv: string[] } {
  const fromSource = import.meta.url.endsWith(".ts");
  return {
    url: new URL(fromSource ? "./cv-pdf.worker.ts" : "./cv-pdf.worker.js", import.meta.url),
    execArgv: fromSource ? ["--import", "tsx"] : [],
  };
}

/**
 * Extracts a CV's text off the API event loop (Sentinela S-1): one short-lived `worker_thread` per upload,
 * with a deadline that **terminates** it, a V8 memory budget and a small concurrency cap. A PDF that runs
 * out of time or memory is rejected as `TOO_COMPLEX` (422); the API keeps serving meanwhile. The thread's
 * stdout/stderr are drained and discarded so pdf.js output can never reach the logs.
 */
export class CvPdfExtractor implements OnApplicationShutdown {
  readonly #running = new Set<Worker>();

  constructor(private readonly limits: CvPdfExtractorLimits = DEFAULT_CV_PDF_EXTRACTOR_LIMITS) {}

  /** `file` is not modified; the thread gets its own copy (transferred). */
  async extract(file: Buffer): Promise<string> {
    if (!hasPdfSignature(file)) throw new CvPdfError("NOT_PDF");
    if (this.#running.size >= this.limits.maxConcurrent) {
      throw new CvPdfBusyError(this.limits.retryAfterSeconds);
    }
    const copy = new Uint8Array(file);
    const entry = workerEntry();
    const worker = new Worker(entry.url, {
      workerData: { file: copy },
      transferList: [copy.buffer],
      execArgv: entry.execArgv,
      resourceLimits: this.limits.resourceLimits,
      stdout: true,
      stderr: true,
      env: {},
    });
    worker.stdout.resume();
    worker.stderr.resume();
    this.#running.add(worker);

    try {
      return await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new CvPdfError("TOO_COMPLEX"));
          void worker.terminate();
        }, this.limits.timeoutMs);
        const settle = (outcome: () => void) => {
          clearTimeout(timer);
          outcome();
        };
        worker.once("message", (result: CvPdfWorkerResult) =>
          settle(() => (result.ok ? resolve(result.text) : reject(new CvPdfError(result.reason)))),
        );
        // ERR_WORKER_OUT_OF_MEMORY and any crash: the reason only, never the error's message.
        worker.once("error", (error: NodeJS.ErrnoException) =>
          settle(() =>
            reject(
              new CvPdfError(
                error.code === "ERR_WORKER_OUT_OF_MEMORY" ? "TOO_COMPLEX" : "UNREADABLE",
              ),
            ),
          ),
        );
        worker.once("exit", () => settle(() => reject(new CvPdfError("UNREADABLE"))));
      });
    } finally {
      this.#running.delete(worker);
      void worker.terminate();
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all([...this.#running].map((worker) => worker.terminate()));
  }
}
