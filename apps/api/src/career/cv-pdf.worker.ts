/**
 * Parsing thread of `CvPdfExtractor`: receives one PDF (transferred, never copied back), answers one message
 * with the text or the rejection reason, and exits. Errors are reported by reason only, never by message,
 * so no PDF content can travel back in an error.
 */
import { parentPort, workerData } from "node:worker_threads";
import { CvPdfError } from "./cv-pdf.js";
import { parsePdfText } from "./cv-pdf-text.js";

export type CvPdfWorkerResult =
  { ok: true; text: string } | { ok: false; reason: CvPdfError["reason"] };

const { file } = workerData as { file: Uint8Array };

parsePdfText(file).then(
  (text) => parentPort?.postMessage({ ok: true, text } satisfies CvPdfWorkerResult),
  (error: unknown) =>
    parentPort?.postMessage({
      ok: false,
      reason: error instanceof CvPdfError ? error.reason : "UNREADABLE",
    } satisfies CvPdfWorkerResult),
);
