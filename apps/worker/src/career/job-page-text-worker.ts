/**
 * Worker-thread entry of the job page extraction (QA #104). Loaded by `job-page-text-runner.ts` as a plain module:
 * the `.js` build in production, the `.ts` source under Node's type stripping in tests, hence the extension
 * taken from this file's own URL. Erasable TypeScript only.
 */
import { parentPort, workerData } from "node:worker_threads";
import type * as JobPageTextModule from "./job-page-text.js";

const extension = import.meta.url.endsWith(".ts") ? ".ts" : ".js";
const { extractJobPageText } = (await import(
  `./job-page-text${extension}`
)) as typeof JobPageTextModule;

const { body, contentType } = workerData as { body: string; contentType: string };
parentPort?.postMessage(extractJobPageText(body, contentType));
