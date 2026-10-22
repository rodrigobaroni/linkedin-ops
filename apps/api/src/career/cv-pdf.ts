/** `%PDF-`: every PDF starts with this header (ISO 32000-1 §7.5.2). The file name and declared type are ignored. */
const PDF_SIGNATURE = Buffer.from("%PDF-", "latin1");

export type CvPdfRejection =
  /** Not a PDF by its signature. */
  | "NOT_PDF"
  /** pdf.js could not open it (corrupt, truncated, password-protected). */
  | "UNREADABLE"
  | "TOO_MANY_PAGES"
  /** No text layer (scanned image) — OCR is out of scope. */
  | "NO_TEXT"
  | "TOO_MUCH_TEXT"
  /** Parsing exceeded its deadline or its memory budget: the worker thread was terminated. */
  | "TOO_COMPLEX";

/** Expected rejection of an uploaded file. The message never carries file content. */
export class CvPdfError extends Error {
  constructor(readonly reason: CvPdfRejection) {
    super(`CV PDF rejected: ${reason}`);
    this.name = "CvPdfError";
  }
}

/** Every parsing slot is busy; the client should retry shortly (`503` + `Retry-After`). */
export class CvPdfBusyError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("CV PDF parsing at capacity");
    this.name = "CvPdfBusyError";
  }
}

export function hasPdfSignature(file: Uint8Array): boolean {
  if (file.length < PDF_SIGNATURE.length) return false;
  return PDF_SIGNATURE.every((byte, index) => file[index] === byte);
}

/** Unicode NFC, no control characters except newlines, trimmed lines, at most one blank line in a row. */
export function normalizeText(text: string): string {
  return (
    text
      .normalize("NFC")
      // eslint-disable-next-line no-control-regex
      .replaceAll(/[\u0000-\u0008\u000B-\u001F\u007F]/g, " ")
      .split("\n")
      .map((line) => line.replaceAll(/[ \t\u00A0]+/g, " ").trim())
      .join("\n")
      .replaceAll(/\n{3,}/g, "\n\n")
      .trim()
  );
}
