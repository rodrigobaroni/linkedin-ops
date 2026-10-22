import { afterEach, describe, expect, it, vi } from "vitest";
import { extractText, getDocumentProxy, getMeta } from "unpdf";
import {
  ADDITION_NOTE_MARKER,
  PT_ACCENTS,
  fictitiousBaseCv,
  fictitiousTailoredCv,
  longTailoredCv,
} from "../../../test/fixtures/tailored-cv.js";
import { performance } from "node:perf_hooks";
import type { CvSegment } from "@linkedin-ops/contracts";
import {
  MAX_RENDERED_CHARS,
  TailoredCvRenderError,
  TailoredCvTooLargeError,
  breakLongTokens,
  printable,
  renderTailoredCvPdf,
} from "./tailored-cv.pdf.js";

const KB = 1024;

function segmentOf(index: number, text: string): CvSegment {
  return {
    segmentId: `seg-${100 + index}`,
    text,
    provenance: "original",
    sourceCvItemIds: ["summary"],
    targetRequirementIds: [],
    additionNote: null,
  };
}

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

  it("drops characters the embedded fonts cannot draw instead of printing empty boxes", async () => {
    const input = sample();
    input.base.contact.name = "Ana 日本語 Exemplo 😀";
    input.content.summary.segments[0]!.text = "Resumo\u0007 com emoji 🚀 e ideograma 漢.";

    const { text } = await textOf(await renderTailoredCvPdf(input));
    expect(text).toContain("Ana");
    expect(text).toContain("Exemplo");
    expect(text).toContain("Resumo com emoji");
    expect(text).not.toMatch(/[\u3040-\u9fff]|\p{Extended_Pictographic}/u);
    expect(text).not.toContain("\u0007");
  });

  it("lays out the worst case (unbreakable runs up to the cap) without wrapping past 40 graphemes", async () => {
    // "W" is the widest glyph: the most line breaks per run. Before `breakLongTokens`, 20 000 characters
    // of it took ~1 s locally and ~6 s on the QA machine (quadratic). The structural check below is the
    // guard (every run wraps at the 40-grapheme breaks); the time bound is only a smoke test, with a warm-up
    // and room for slow CI runners (~50 ms locally, ~0.6 s on CI; without the breaks, seconds).
    await renderTailoredCvPdf(sample());
    const input = sample();
    const runs = Math.floor((MAX_RENDERED_CHARS - 4_000) / 2_000);
    input.content.summary.segments = Array.from({ length: runs }, (_, i) =>
      segmentOf(i, "W".repeat(2_000)),
    );
    // Several bullets: every list item (not only the first) goes through the token breaks.
    input.content.experiences[0]!.bullets.segments = [97, 98, 99].map((n) =>
      segmentOf(n, "W".repeat(500)),
    );

    const started = performance.now();
    const pdf = await renderTailoredCvPdf(input);
    expect(performance.now() - started).toBeLessThan(2_000);
    const { text } = await textOf(pdf);
    const pieces = text.split(/[\s\u200B]+/).filter((piece) => /^W+$/.test(piece));
    expect(pieces.join("")).toBe("W".repeat(runs * 2_000 + 3 * 500));
    expect(Math.max(...pieces.map((piece) => piece.length))).toBeLessThanOrEqual(40);
  });

  it("refuses a tailored CV above the printed-character cap before laying it out", async () => {
    const input = sample();
    input.content.experiences[0]!.bullets.segments = Array.from({ length: 16 }, (_, i) =>
      segmentOf(i, "Texto ".repeat(333)),
    );

    const started = performance.now();
    const error = await renderTailoredCvPdf(input).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TailoredCvTooLargeError);
    expect((error as Error).message).not.toContain("Texto");
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it("never breaks contact links or e-mail: ATS reads them whole from the extracted text", async () => {
    // 86 characters, longer than the old 60-character threshold: it used to come out as "…- da-…".
    const url =
      "https://www.linkedin.com/in/ana-exemplo-da-conceicao-engenheira-de-software-1234567890";
    const email = `ana.exemplo.da.conceicao.engenharia.de.software.${"x".repeat(30)}@example.test`;
    const input = sample();
    input.base.contact.links = [url];
    input.base.contact.email = email;
    input.base.contact.phone = null;
    input.base.contact.location = null;

    const { text } = await textOf(await renderTailoredCvPdf(input));
    expect(text).toContain(url);
    expect(text).toContain(email);
    expect(text).not.toContain("\u200B");
  });

  it("leaves body tokens up to 100 characters whole and breaks longer ones", async () => {
    // A token that fits the line comes out whole; one over 100 characters gets zero-width spaces.
    const whole = `https://example.test/${"a".repeat(64)}`;
    const long = "b".repeat(150);
    const input = sample();
    input.content.experiences[0]!.bullets.segments = [segmentOf(1, whole), segmentOf(2, long)];

    const { text } = await textOf(await renderTailoredCvPdf(input));
    expect(text).toContain(whole);
    // The long run is the SECOND list item: it wraps at the 40-grapheme breaks, not at the line width (~85).
    const pieces = text.split(/[\s\u200B]+/).filter((piece) => /^b+$/.test(piece));
    expect(pieces.join("")).toBe(long);
    expect(Math.max(...pieces.map((piece) => piece.length))).toBeLessThanOrEqual(40);
    expect(text.replace(/[\s\u200B]/g, "")).toContain(long);
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

describe("breakLongTokens", () => {
  it("leaves words and runs up to 100 characters alone", () => {
    const text = `uma frase normal ${"a".repeat(100)} fim`;
    expect(breakLongTokens(text)).toBe(text);
  });

  it("puts a zero-width space every 40 graphemes of a longer run, keeping the spaces around it", () => {
    expect(breakLongTokens(`x ${"ç".repeat(101)} y`)).toBe(
      `x ${"ç".repeat(40)}\u200B${"ç".repeat(40)}\u200B${"ç".repeat(21)} y`,
    );
    const broken = breakLongTokens("W".repeat(2_000));
    expect(broken.split("\u200B").every((part) => part.length === 40)).toBe(true);
    expect(broken.replaceAll("\u200B", "")).toBe("W".repeat(2_000));
  });

  it("never separates a base letter from its combining marks", () => {
    // q + U+0301 and n + U+0303 + U+0323 have no precomposed form: two and three code points per grapheme.
    for (const cluster of ["q\u0301", "n\u0303\u0323"]) {
      const broken = breakLongTokens(cluster.repeat(120));
      expect(broken).not.toMatch(/\u200B\p{M}/u);
      expect(broken.split("\u200B").map((part) => part.length)).toEqual([
        40 * cluster.length,
        40 * cluster.length,
        40 * cluster.length,
      ]);
    }
  });
});

describe("printable", () => {
  it("keeps Latin with accents, Greek, Cyrillic, typographic punctuation and line breaks", () => {
    expect(printable("ação — “ok” · α Ж\nfim")).toBe("ação — “ok” · α Ж\nfim");
  });

  it("composes to NFC, turns tabs into spaces and drops controls, CJK and emoji", () => {
    expect(printable("e\u0301\tx\u0000\u0007\u0085")).toBe("é x");
    expect(printable("日本 😀 👍🏽")).toBe("");
  });
});
