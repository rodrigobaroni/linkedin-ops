/**
 * Runs the job page extraction in a worker thread with a hard timeout and memory limits (QA #104), so hostile
 * markup can never block the worker's event loop: pg-boss heartbeats, other queues and SIGTERM keep running, and
 * `expireInSeconds` could not interrupt synchronous code anyway. A timeout, a crash or an over-limit worker is
 * `unreadable`, which the fetcher maps to `permanent` (paste-text, no new fetch).
 */
import { Worker } from "node:worker_threads";
import type { JobPageText } from "./job-page-text.js";

export const JOB_PAGE_TEXT_TIMEOUT_MS = 5_000;

const extension = import.meta.url.endsWith(".ts") ? ".ts" : ".js";
const WORKER_URL = new URL(`./job-page-text-worker${extension}`, import.meta.url);

export interface IsolatedExtractionOptions {
  timeoutMs?: number;
}

export function extractJobPageTextIsolated(
  body: string,
  contentType: string,
  options: IsolatedExtractionOptions = {},
): Promise<JobPageText> {
  const timeoutMs = options.timeoutMs ?? JOB_PAGE_TEXT_TIMEOUT_MS;
  return new Promise((resolve) => {
    let settled = false;
    const worker = new Worker(WORKER_URL, {
      workerData: { body, contentType },
      resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 },
      stdout: true,
      stderr: true,
    });
    const settle = (result: JobPageText) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
      void worker.terminate();
    };
    const timer = setTimeout(() => settle({ kind: "unreadable" }), timeoutMs);
    worker.once("message", (result: JobPageText) => settle(result));
    worker.once("error", () => settle({ kind: "unreadable" }));
    worker.once("exit", () => settle({ kind: "unreadable" }));
  });
}
