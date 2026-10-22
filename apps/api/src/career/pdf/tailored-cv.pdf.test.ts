import { afterEach, describe, expect, it, vi } from "vitest";
import { extractText, getDocumentProxy, getMeta } from "unpdf";
import {
  ADDITION_NOTE_MARKER,
  PT_ACCENTS,
  fictitiousBaseCv,
  fictitiousTailoredCv,
  longTailoredCv,
} from "../../../test/fixtures/tailored-cv.js";
import { TailoredCvRenderError, renderTailoredCvPdf } from "./tailored-cv.pdf.js";

const KB = 1024;

function sample() {
  return { base: fictitiousBaseCv(), content: fictitiousTailoredCv() };
}

async function textOf(pdf: Buffer): Promise<{ text: string; pages: number }> {
  const document = await getDocumentProxy(new Uint8Array(pdf));
  const { text, totalPages } = await extractText(document, { mergePages: true });
  return { text: text.replace(/\s+/g, " "), pages: totalPages };
}

/** Raw bytes as latin1: object syntax, dictionary keys and uncompressed strings are greppable. */
function raw(pdf: Buffer): string {
  return pdf.toString("latin1");
}

afterEach(() => {
  vi.useRealTimers();
});

describe("renderTailoredCvPdf", () => {
  it("opens and has selectable text with every tailored segment, in Portuguese with accents", async () => {
    const input = sample();
    const { text, pages } = await textOf(await renderTailoredCvPdf(input));

    expect(pages).toBe(1);
    expect(text).toContain("Ana Exemplo da Conceição");
    expect(text).toContain(PT_ACCENTS);
    const segments = [
      ...input.content.summary.segments,
      ...input.content.experiences.flatMap((item) => [
        ...item.bullets.segments,
        ...item.skills.segments,
      ]),
      ...input.content.skills.technical.segments,
      ...input.content.skills.behavioral.segments,
    ];
    for (const segment of segments) expect(text).toContain(segment.text);
    for (const fromBase of [
      "Engenheira Sênior — Empresa Fictícia S.A.",
      "2021-03 – atual",
      "Universidade Imaginária",
      "Certificação Fictícia",
      "Inglês (fluente)",
      "EXPERIÊNCIA",
      "FORMAÇÃO",
    ]) {
      expect(text).toContain(fromBase);
    }
  });

  it("never prints provenance, segment ids or addition notes", async () => {
    const pdf = await renderTailoredCvPdf(sample());
    const { text } = await textOf(pdf);

    expect(text).not.toContain(ADDITION_NOTE_MARKER);
    expect(text).not.toMatch(/\b(added|rewritten|acrescentad[oa]|reescrit[oa]|proveni[eê]ncia)\b/i);
    expect(text).not.toMatch(/\b(seg|exp|req|edu|cert|lang|skill)-\d/);
    expect(raw(pdf)).not.toContain(ADDITION_NOTE_MARKER);
  });

  it("writes neutral metadata: no Producer, Creator, dates or XMP packet", async () => {
    const pdf = await renderTailoredCvPdf(sample());
    const { info, metadata } = await getMeta(new Uint8Array(pdf));

    for (const key of ["Producer", "Creator", "CreationDate", "ModDate", "Author", "Title"]) {
      expect(info).not.toHaveProperty(key);
    }
    expect(metadata ?? {}).toEqual({});
    const bytes = raw(pdf);
    expect(bytes).not.toMatch(
      /pdfkit|pdf-lib|Producer|Creator|CreationDate|ModDate|\/Metadata|xmp/i,
    );
  });

  it("embeds subset fonts and uses none of the standard 14", async () => {
    const bytes = raw(await renderTailoredCvPdf(sample()));

    expect(bytes).toMatch(/\/FontName \/[A-Z]{6}\+SourceSans3-Regular/);
    expect(bytes).toMatch(/\/FontName \/[A-Z]{6}\+SourceSans3-Semibold/);
    expect(bytes).toContain("/FontFile2");
    expect(bytes).not.toMatch(/\/BaseFont \/(Helvetica|Times|Courier|Symbol|ZapfDingbats)/);
  });

  it("is a tagged PDF in the posting language", async () => {
    const pt = raw(await renderTailoredCvPdf(sample()));
    expect(pt).toContain("/StructTreeRoot");
    expect(pt).toMatch(/\/Marked true/);
    expect(pt).toContain("/Lang (pt-BR)");

    const input = sample();
    input.content.language = "en";
    const enPdf = await renderTailoredCvPdf(input);
    expect(raw(enPdf)).toContain("/Lang (en)");
    const { text } = await textOf(enPdf);
    expect(text).toContain("EXPERIENCE");
    expect(text).toContain("2021-03 – Present");
  });

  it("is deterministic: same input, same bytes, whatever the clock says", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const first = await renderTailoredCvPdf(sample());
    vi.setSystemTime(new Date("2031-07-15T12:34:56Z"));
    const second = await renderTailoredCvPdf(sample());

    expect(second.equals(first)).toBe(true);
  });

  it("derives the document /ID from the input, not from a constant", async () => {
    const idOf = (pdf: Buffer) => /\/ID \[<([0-9a-f]{32})>/.exec(raw(pdf))?.[1];
    const changed = sample();
    changed.content.summary.segments[0]!.text = "Outro resumo.";

    const a = idOf(await renderTailoredCvPdf(sample()));
    const b = idOf(await renderTailoredCvPdf(changed));
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(b).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toBe(b);
  });

  it("paginates a long CV without losing a line, at a reasonable size", async () => {
    const pdf = await renderTailoredCvPdf(longTailoredCv(8, 8));
    const { text, pages } = await textOf(pdf);

    expect(pages).toBeGreaterThan(1);
    const tokens = text.match(/FIM-\d+-\d+/g) ?? [];
    const expected = Array.from({ length: 8 }, (_, e) =>
      Array.from({ length: 8 }, (_, n) => `FIM-${e + 1}-${n + 1}`),
    ).flat();
    expect(tokens).toEqual(expected);
    expect(pdf.length).toBeLessThan(150 * KB);
  });

  it("keeps a typical CV small", async () => {
    const pdf = await renderTailoredCvPdf(sample());
    expect(pdf.length).toBeLessThan(60 * KB);
  });

  it("rejects a tailored CV citing a missing base item, naming only the id", async () => {
    const input = sample();
    input.content.educationIds = ["edu-404"];

    const error = await renderTailoredCvPdf(input).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TailoredCvRenderError);
    expect((error as TailoredCvRenderError).missingItemId).toBe("edu-404");
    expect((error as Error).message).not.toContain("Ana");
  });
});
