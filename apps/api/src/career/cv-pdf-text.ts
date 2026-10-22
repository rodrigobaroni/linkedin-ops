import { CV_UPLOAD_LIMITS } from "@linkedin-ops/contracts";
import { getDocumentProxy } from "unpdf";

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
  | "TOO_MUCH_TEXT";

/** Expected rejection of an uploaded file. The message never carries file content. */
export class CvPdfError extends Error {
  constructor(readonly reason: CvPdfRejection) {
    super(`CV PDF rejected: ${reason}`);
    this.name = "CvPdfError";
  }
}

export function hasPdfSignature(file: Buffer): boolean {
  return file.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE);
}

/**
 * Extracts the text layer of an uploaded CV with pdf.js (unpdf's serverless build: pure JS, no native
 * binary, no `eval` code path). The caller owns the buffer and discards it right after; nothing here keeps a copy,
 * logs, or writes to disk. pdf.js console output is limited to errors (`verbosity: 0`).
 */
export async function extractCvPdfText(file: Buffer): Promise<string> {
  if (!hasPdfSignature(file)) throw new CvPdfError("NOT_PDF");
  // pdf.js may transfer (detach) the array it is given; it gets a copy so the caller can still wipe `file`.
  const data = new Uint8Array(file);
  let document: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    document = await getDocumentProxy(data, {
      disableFontFace: true,
      useSystemFonts: false,
      verbosity: 0,
    });
  } catch {
    throw new CvPdfError("UNREADABLE");
  }
  try {
    if (document.numPages > CV_UPLOAD_LIMITS.maxPages) throw new CvPdfError("TOO_MANY_PAGES");
    const pages: string[] = [];
    let length = 0;
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      const lines: string[] = [];
      let line = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        line += item.str;
        if (item.hasEOL) {
          lines.push(line);
          line = "";
        }
      }
      if (line !== "") lines.push(line);
      page.cleanup();
      const text = lines.join("\n");
      length += text.length;
      if (length > CV_UPLOAD_LIMITS.maxTextChars * 2) throw new CvPdfError("TOO_MUCH_TEXT");
      pages.push(text);
    }
    const text = normalizeText(pages.join("\n\n"));
    if (text === "") throw new CvPdfError("NO_TEXT");
    if (text.length > CV_UPLOAD_LIMITS.maxTextChars) throw new CvPdfError("TOO_MUCH_TEXT");
    return text;
  } catch (error) {
    if (error instanceof CvPdfError) throw error;
    throw new CvPdfError("UNREADABLE");
  } finally {
    await document.loadingTask.destroy();
    // Usually detached by pdf.js already (nothing left to wipe); otherwise the copy is wiped too.
    if (data.byteLength > 0) data.fill(0);
  }
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
