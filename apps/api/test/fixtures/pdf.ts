/**
 * Minimal, valid PDF 1.4 builder for the CV tests: one Helvetica text line per entry, WinAnsi (Latin-1)
 * encoded so Portuguese accents survive. Every CV used in tests is fictitious (spec 2026-10-22 §10).
 */
export interface FakePdfOptions {
  /** One array of lines per page; an empty array is a page without a text layer (a "scan"). */
  pages: string[][];
  /** Adds a Standard security handler whose user password is not empty (pdf.js asks for a password). */
  encrypted?: boolean;
  /** Bytes of a comment line right after the header (offsets stay valid); used to hit an exact size. */
  padding?: number;
}

export function buildPdf({ pages, encrypted = false, padding = 0 }: FakePdfOptions): Buffer {
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

  if (encrypted) {
    const garbage = "A".repeat(32);
    objects.push(`<< /Filter /Standard /V 1 /R 2 /O (${garbage}) /U (${garbage}) /P -4 >>`);
  }
  const encryptId = encrypted ? objects.length - 1 : null;

  let out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  if (padding > 0) out += `%${" ".repeat(padding - 2)}\n`;
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
  const encryption =
    encryptId === null
      ? ""
      : ` /Encrypt ${encryptId} 0 R /ID [<0123456789abcdef0123456789abcdef> <0123456789abcdef0123456789abcdef>]`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R${encryption} >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/**
 * Adversarial PDF (Sentinela S-1), a "billion laughs" of Form XObjects: each level draws the level below
 * `fanOut` times, so a file of a few KB makes pdf.js evaluate `fanOut ** depth` text runs (all on the page,
 * so the text items also pile up in memory). Well under the 5 MiB upload limit.
 */
export function xObjectBombPdf(depth = 9, fanOut = 10): Buffer {
  const objects: string[] = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
  const formId = (level: number) => 6 + level;
  objects[3] =
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] " +
    `/Resources << /Font << /F1 4 0 R >> /XObject << /X 0 R >> >> /Contents 5 0 R >>`.replace(
      "/X 0 R",
      `/X${depth} ${formId(depth)} 0 R`,
    );
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  const stream = (body: string, extra = "") =>
    `<< /Length ${Buffer.byteLength(body, "latin1")}${extra} >>\nstream\n${body}\nendstream`;
  objects[5] = stream(`/X${depth} Do`);
  objects[formId(0)] = stream(
    "BT /F1 9 Tf 100 400 Td (laugh) Tj ET",
    " /Type /XObject /Subtype /Form /BBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >>",
  );
  for (let level = 1; level <= depth; level += 1) {
    const below = `/X${level - 1}`;
    objects[formId(level)] = stream(
      `${below} Do `.repeat(fanOut).trim(),
      ` /Type /XObject /Subtype /Form /BBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> /XObject << ${below} ${formId(level - 1)} 0 R >> >>`,
    );
  }
  let out = "%PDF-1.4\n";
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

/** The fictitious CV padded to exactly `totalBytes` (still a valid, readable PDF). */
export function fictitiousCvPdfOfSize(totalBytes: number): Buffer {
  // The `startxref` number grows with the padding, so converge instead of computing once.
  let padding = Math.max(2, totalBytes - fictitiousCvPdf().length);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const file = buildPdf({ pages: fictitiousCvPages("CANARIO-0000"), padding });
    if (file.length === totalBytes) return file;
    padding += totalBytes - file.length;
    if (padding < 2) break;
  }
  throw new Error(`cannot pad the fictitious CV to ${totalBytes} bytes`);
}

/** A fictitious CV (nobody's real data). `marker` lets a test prove the text never leaks to logs. */
export function fictitiousCvPdf(marker = "CANARIO-0000"): Buffer {
  return buildPdf({ pages: fictitiousCvPages(marker) });
}

function fictitiousCvPages(marker: string): string[][] {
  return [
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
  ];
}
