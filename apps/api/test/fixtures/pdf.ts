/**
 * Minimal, valid PDF 1.4 builder for the CV tests: one Helvetica text line per entry, WinAnsi (Latin-1)
 * encoded so Portuguese accents survive. Every CV used in tests is fictitious (spec 2026-10-22 §10).
 */
export interface FakePdfOptions {
  /** One array of lines per page; an empty array is a page without a text layer (a "scan"). */
  pages: string[][];
}

export function buildPdf({ pages }: FakePdfOptions): Buffer {
  const objects: string[] = [];
  const pageCount = pages.length;
  // 1 catalog, 2 pages tree, 3 font, then (page, content) pairs.
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  const kids = pages.map((_, index) => `${4 + index * 2} 0 R`).join(" ");
  objects[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  pages.forEach((lines, index) => {
    const pageId = 4 + index * 2;
    const contentId = pageId + 1;
    const body = lines.length
      ? [
          "BT /F1 11 Tf 14 TL 56 780 Td",
          ...lines.map((line) => `(${escapePdfText(line)}) Tj T*`),
          "ET",
        ].join("\n")
      : "0.9 g 56 700 200 50 re f";
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] =
      `<< /Length ${Buffer.byteLength(body, "latin1")} >>\nstream\n${body}\nendstream`;
  });

  let out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(out, "latin1");
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) {
    out += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

function escapePdfText(text: string): string {
  return text.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

/** A fictitious CV (nobody's real data). `marker` lets a test prove the text never leaks to logs. */
export function fictitiousCvPdf(marker = "CANARIO-0000"): Buffer {
  return buildPdf({
    pages: [
      [
        "Ana Exemplo da Silva",
        "Engenheira de Software · São Paulo, SP",
        "ana.exemplo@example.test · +55 11 90000-0000",
        "",
        "Resumo",
        `Engenheira com foco em sistemas distribuídos. ${marker}`,
        "",
        "Experiência",
        "Empresa Fictícia S.A. - Engenheira Sênior (2021 - atual)",
        "Conduziu a migração de filas para PostgreSQL.",
      ],
      [
        "Formação",
        "Universidade Imaginária - Ciência da Computação (2012 - 2016)",
        "Idiomas",
        "Inglês - fluente",
      ],
    ],
  });
}
