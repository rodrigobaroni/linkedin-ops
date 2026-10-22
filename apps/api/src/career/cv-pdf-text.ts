import { CV_UPLOAD_LIMITS } from "@linkedin-ops/contracts";
import { getDocumentProxy } from "unpdf";
import { CvPdfError, hasPdfSignature, normalizeText } from "./cv-pdf.js";

/**
 * Extracts the text layer of a CV PDF with pdf.js (unpdf's serverless build: pure JS, no native binary, no
 * `eval` code path). Runs **only inside the parsing worker thread** (`cv-pdf.worker.ts`), never on the API
 * event loop: a hostile PDF can make pdf.js spin or allocate without bound, and only terminating the thread
 * stops it (`CvPdfExtractor`). Nothing here keeps a copy, logs, or writes to disk; `data` is wiped (or already
 * detached by pdf.js) when this returns.
 */
export async function parsePdfText(data: Uint8Array): Promise<string> {
  if (!hasPdfSignature(data)) throw new CvPdfError("NOT_PDF");
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
    // Usually detached by pdf.js already (nothing left to wipe); otherwise it is wiped here.
    if (data.byteLength > 0) data.fill(0);
  }
}
