import { readFileSync } from "node:fs";
import { CV_UPLOAD_LIMITS } from "@linkedin-ops/contracts";
import { describe, expect, it } from "vitest";
import { buildPdf, fictitiousCvPdf } from "../../test/fixtures/pdf.js";
import { CvPdfError, extractCvPdfText, hasPdfSignature, normalizeText } from "./cv-pdf.js";

const COMMITTED_FIXTURE = new URL("../../test/fixtures/cv-ficticio.pdf", import.meta.url);

async function rejection(file: Buffer): Promise<string> {
  const error = await extractCvPdfText(file).then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(CvPdfError);
  return (error as CvPdfError).reason;
}

describe("extractCvPdfText", () => {
  it("extracts the text layer of every page, line by line, with accents", async () => {
    const text = await extractCvPdfText(fictitiousCvPdf("CANARIO-1234"));
    expect(text).toContain("Ana Exemplo da Silva");
    expect(text).toContain("Engenheira com foco em sistemas distribuídos. CANARIO-1234");
    expect(text).toContain("Empresa Fictícia S.A. - Engenheira Sênior (2021 - atual)");
    expect(text).toContain("Inglês - fluente");
    expect(text.split("\n")).toContain("Formação");
  });

  it("reads the committed fictitious CV (regenerate with test/fixtures/pdf.ts)", async () => {
    const file = readFileSync(COMMITTED_FIXTURE);
    expect(file.equals(fictitiousCvPdf())).toBe(true);
    expect(await extractCvPdfText(file)).toContain("Universidade Imaginária");
  });

  it("checks the signature, not the name or the declared type", async () => {
    expect(hasPdfSignature(Buffer.from("%PDF-1.7\n"))).toBe(true);
    expect(await rejection(Buffer.from("PK\u0003\u0004 not a pdf"))).toBe("NOT_PDF");
    expect(await rejection(Buffer.from(" %PDF-1.4 leading space"))).toBe("NOT_PDF");
    expect(await rejection(Buffer.alloc(0))).toBe("NOT_PDF");
  });

  it("rejects a corrupt PDF as unreadable", async () => {
    expect(await rejection(Buffer.from("%PDF-1.4\ngarbage without objects"))).toBe("UNREADABLE");
  });

  it("rejects a PDF without a text layer (scan)", async () => {
    expect(await rejection(buildPdf({ pages: [[], []] }))).toBe("NO_TEXT");
  });

  it("rejects more pages than a CV has", async () => {
    const pages = Array.from({ length: CV_UPLOAD_LIMITS.maxPages + 1 }, () => ["linha"]);
    expect(await rejection(buildPdf({ pages }))).toBe("TOO_MANY_PAGES");
  });

  it("rejects more text than the draft may keep", async () => {
    // pdf.js drops text outside the page box: fill pages within it (50 lines of 80 chars each).
    const page = Array.from({ length: 50 }, () => "palavra ".repeat(10));
    const pageCount = Math.ceil(CV_UPLOAD_LIMITS.maxTextChars / (50 * 80)) + 2;
    expect(pageCount).toBeLessThanOrEqual(CV_UPLOAD_LIMITS.maxPages);
    const pages = Array.from({ length: pageCount }, () => page);
    expect(await rejection(buildPdf({ pages }))).toBe("TOO_MUCH_TEXT");
  });

  it("leaves the caller's buffer intact so it can wipe it", async () => {
    const file = fictitiousCvPdf();
    const copy = Buffer.from(file);
    await extractCvPdfText(file);
    expect(file.equals(copy)).toBe(true);
  });
});

describe("normalizeText", () => {
  it("drops control characters, collapses blanks and blank lines, keeps line breaks", () => {
    expect(normalizeText("  Ana\u0000  Exemplo \r\n\n\n\nResumo\t\tok  ")).toBe(
      "Ana Exemplo\n\nResumo ok",
    );
  });

  it("composes Unicode (NFC)", () => {
    expect(normalizeText("São Paulo")).toBe("São Paulo");
  });
});
