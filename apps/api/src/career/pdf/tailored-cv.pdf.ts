import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type {
  CareerLanguage,
  CvSegmentList,
  CvStructured,
  TailoredCvContent,
} from "@linkedin-ops/contracts";
import { create as openFont, type Font } from "fontkit";
import PDFDocument from "pdfkit";

/**
 * Tailored CV → PDF (spec §5 item 7, D3/D6; ADR-0009). Pure: same input, same bytes.
 *
 * - Only `segment.text` is printed: provenance, ids and addition notes stay in the review UI (spec §8, D4).
 * - Contact, company, title, dates, education, certifications and languages come from the base CV by id.
 * - Neutral metadata: empty Info dictionary (no Producer, Creator or dates), no XMP packet, and a document
 *   `/ID` derived from the input instead of the clock.
 * - Embedded subset of Source Sans 3 (OFL, `apps/api/assets/fonts`): selectable text with PT accents.
 *   Characters the fonts cannot draw (CJK, emoji, controls) are dropped instead of printed as empty boxes.
 * - Tagged PDF (structure tree + `/Lang`) for screen readers and ATS text extraction.
 */

export interface TailoredCvPdfInput {
  readonly content: TailoredCvContent;
  readonly base: CvStructured;
}

/** The tailored CV cites a base CV item that no longer exists. The message carries the id, never content. */
export class TailoredCvRenderError extends Error {
  constructor(readonly missingItemId: string) {
    super(`Tailored CV references unknown base CV item "${missingItemId}"`);
    this.name = "TailoredCvRenderError";
  }
}

/**
 * The tailored CV exceeds `MAX_RENDERED_CHARS`: the schema allows far more text than any CV, and layout cost
 * grows with it on the event loop. Carries the limit only, never content.
 */
export class TailoredCvTooLargeError extends Error {
  constructor(readonly limit: number) {
    super(`Tailored CV exceeds ${limit} printable characters`);
    this.name = "TailoredCvTooLargeError";
  }
}

/**
 * Upper bound of printed characters per document (~12 dense A4 pages; a real CV has well under 10 000).
 * Together with `breakLongTokens` it keeps a render linear and short (ADR-0009, consequences).
 */
export const MAX_RENDERED_CHARS = 30_000;
/** A run without break opportunities longer than this gets one every `TOKEN_CHUNK` characters. */
const LONG_TOKEN = 60;
const TOKEN_CHUNK = 40;
const ZERO_WIDTH_SPACE = "\u200B";
const LONG_TOKEN_PATTERN = new RegExp(`[^\\s\\u200B]{${LONG_TOKEN + 1},}`, "gu");

/**
 * Read at module load, so a missing font fails the API at boot, not at the first download. Resolved relative
 * to this module: `src/career/pdf` and `dist/career/pdf` sit at the same depth (the runtime image copies
 * `apps/api/assets` explicitly).
 */
const FONT_DIR = new URL("../../../assets/fonts/", import.meta.url);
const FONTS = {
  regular: readFileSync(new URL("SourceSans3-Regular.ttf", FONT_DIR)),
  semibold: readFileSync(new URL("SourceSans3-Semibold.ttf", FONT_DIR)),
};
const FONT_FACES = Object.values(FONTS).map((file) => openFont(file) as Font);

const PAGE = { size: "A4", margin: 50 } as const;
const COLOR = { text: "#1a1a1a", muted: "#555555", rule: "#bbbbbb" } as const;
const SIZE = { name: 20, heading: 11, title: 10.5, body: 10, meta: 9.5 } as const;
const BULLET_INDENT = 12;
/** Room a heading needs below it (itself plus a first line) so it never ends a page alone. */
const KEEP_WITH_NEXT = 56;

type LabelKey =
  | "summary"
  | "experience"
  | "skills"
  | "technical"
  | "behavioral"
  | "education"
  | "certifications"
  | "languages"
  | "current";

const LABELS: Record<CareerLanguage, Record<LabelKey, string>> = {
  "pt-BR": {
    summary: "Resumo",
    experience: "Experiência",
    skills: "Competências",
    technical: "Técnicas",
    behavioral: "Comportamentais",
    education: "Formação",
    certifications: "Certificações",
    languages: "Idiomas",
    current: "atual",
  },
  en: {
    summary: "Summary",
    experience: "Experience",
    skills: "Skills",
    technical: "Technical",
    behavioral: "Behavioral",
    education: "Education",
    certifications: "Certifications",
    languages: "Languages",
    current: "Present",
  },
};

/**
 * pdfkit internals this module relies on (pinned 0.20.2; `tailored-cv.pdf.test.ts` fails if they change):
 * `_id` is the trailer `/ID` (hashed from the creation date), and `endMetadata()` writes the XMP packet
 * (CreateDate, CreatorTool, Producer). `doc.info`, the Info dictionary, is public API.
 */
interface PdfKitInternals {
  _id: Uint8Array;
  endMetadata: () => void;
}

export async function renderTailoredCvPdf(input: TailoredCvPdfInput): Promise<Buffer> {
  const { content, base } = input;
  const labels = LABELS[content.language];
  // Every base CV reference is resolved before drawing: a dangling id rejects without a half-written PDF.
  const experiences = content.experiences.map((tailored) => ({
    tailored,
    experience: byId(base.experiences, tailored.cvExperienceId),
  }));
  const education = content.educationIds.map((id) => byId(base.education, id));
  const certifications = content.certificationIds.map((id) => byId(base.certifications, id));
  const languages = content.languageIds.map((id) => byId(base.languages, id));

  const doc = new PDFDocument({
    size: PAGE.size,
    margin: PAGE.margin,
    pdfVersion: "1.7",
    tagged: true,
    lang: content.language,
    autoFirstPage: true,
    bufferPages: false,
  });
  neutralizeMetadata(doc, documentId(input));
  doc.registerFont("regular", FONTS.regular);
  doc.registerFont("semibold", FONTS.semibold);

  let printed = 0;
  /** `printable` + long-token breaks, counted against `MAX_RENDERED_CHARS` before anything is laid out. */
  const prepare = (text: string): string => {
    const shown = printable(text);
    printed += shown.length;
    if (printed > MAX_RENDERED_CHARS) throw new TailoredCvTooLargeError(MAX_RENDERED_CHARS);
    return breakLongTokens(shown);
  };

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const width = doc.page.width - PAGE.margin * 2;
  const document = doc.struct("Document");
  doc.addStructure(document);

  const paragraph = (
    tag: "H1" | "H2" | "H3" | "P",
    text: string,
    font: keyof typeof FONTS,
    size: number,
    color: string,
    options: PDFKit.Mixins.TextOptions = {},
  ): void => {
    const shown = prepare(text);
    if (shown === "") return;
    document.add(
      doc.struct(tag, {}, () => {
        doc
          .font(font)
          .fontSize(size)
          .fillColor(color)
          .text(shown, { width, ...options });
      }),
    );
  };

  /** Starts a new page when fewer than `points` remain, so a heading stays with what follows it. */
  const keepWithNext = (points: number): void => {
    if (doc.y + points > doc.page.height - PAGE.margin) doc.addPage();
  };

  const heading = (text: string): void => {
    doc.moveDown(0.8);
    keepWithNext(KEEP_WITH_NEXT);
    paragraph("H2", text.toUpperCase(), "semibold", SIZE.heading, COLOR.text, {
      characterSpacing: 0.6,
    });
    const y = doc.y + 2;
    // Decoration, not content: an artifact stays out of the structure tree and of screen readers.
    doc
      .markContent("Artifact", { type: "Layout" })
      .moveTo(PAGE.margin, y)
      .lineTo(PAGE.margin + width, y)
      .lineWidth(0.5)
      .strokeColor(COLOR.rule)
      .stroke()
      .endMarkedContent();
    doc.y = y + 5;
  };

  const list = (entries: readonly string[]): void => {
    const items = entries.map(prepare).filter((item) => item !== "");
    if (items.length === 0) return;
    const listStruct = doc.struct("L");
    document.add(listStruct);
    for (const item of items) {
      listStruct.add(
        doc.struct("LI", {}, () => {
          doc
            .font("regular")
            .fontSize(SIZE.body)
            .fillColor(COLOR.text)
            .text(`•  ${item}`, PAGE.margin + BULLET_INDENT, doc.y, {
              width: width - BULLET_INDENT,
              indent: -BULLET_INDENT + 2,
              paragraphGap: 2,
            });
        }),
      );
      doc.x = PAGE.margin;
    }
  };

  // Header: name and contact line.
  const contact = base.contact;
  if (contact.name) paragraph("H1", contact.name, "semibold", SIZE.name, COLOR.text);
  const contactLine = [contact.email, contact.phone, contact.location, ...contact.links].filter(
    (part): part is string => Boolean(part),
  );
  if (contactLine.length > 0) {
    paragraph("P", contactLine.join("  ·  "), "regular", SIZE.meta, COLOR.muted);
  }

  if (content.summary.segments.length > 0) {
    heading(labels.summary);
    paragraph("P", joinSegments(content.summary, " "), "regular", SIZE.body, COLOR.text, {
      lineGap: 1,
    });
  }

  if (experiences.length > 0) {
    heading(labels.experience);
    experiences.forEach(({ tailored, experience }, index) => {
      if (index > 0) doc.moveDown(0.6);
      keepWithNext(KEEP_WITH_NEXT);
      paragraph(
        "H3",
        `${experience.title} — ${experience.company}`,
        "semibold",
        SIZE.title,
        COLOR.text,
      );
      const dates = dateRange(
        experience.startDate,
        experience.endDate,
        experience.isCurrent,
        labels,
      );
      const meta = [experience.location, dates].filter((part): part is string => Boolean(part));
      if (meta.length > 0) {
        paragraph("P", meta.join("  ·  "), "regular", SIZE.meta, COLOR.muted, { paragraphGap: 2 });
      }
      list(tailored.bullets.segments.map((segment) => segment.text));
      if (tailored.skills.segments.length > 0) {
        paragraph(
          "P",
          `${labels.skills}: ${joinSegments(tailored.skills, ", ")}`,
          "regular",
          SIZE.meta,
          COLOR.muted,
        );
      }
    });
  }

  const technical = joinSegments(content.skills.technical, ", ");
  const behavioral = joinSegments(content.skills.behavioral, ", ");
  if (technical || behavioral) {
    heading(labels.skills);
    if (technical) {
      paragraph("P", `${labels.technical}: ${technical}`, "regular", SIZE.body, COLOR.text);
    }
    if (behavioral) {
      paragraph("P", `${labels.behavioral}: ${behavioral}`, "regular", SIZE.body, COLOR.text);
    }
  }

  if (education.length > 0) {
    heading(labels.education);
    for (const item of education) {
      const course = [item.degree, item.field].filter(Boolean).join(", ");
      const dates = dateRange(item.startDate, item.endDate, false, labels);
      paragraph(
        "P",
        [course, item.institution, dates].filter(Boolean).join("  ·  "),
        "regular",
        SIZE.body,
        COLOR.text,
      );
    }
  }

  if (certifications.length > 0) {
    heading(labels.certifications);
    list(
      certifications.map((item) =>
        [item.name, item.issuer, item.date].filter(Boolean).join("  ·  "),
      ),
    );
  }

  if (languages.length > 0) {
    heading(labels.languages);
    paragraph(
      "P",
      languages
        .map((item) => (item.level ? `${item.language} (${item.level})` : item.language))
        .join("  ·  "),
      "regular",
      SIZE.body,
      COLOR.text,
    );
  }

  document.end();
  doc.end();
  return done;
}

/**
 * NFC, tabs as spaces, and only characters both embedded fonts can draw (plus line breaks): anything else
 * (CJK, emoji, control characters) is dropped rather than printed as a `.notdef` box (ADR-0009, known limit).
 */
export function printable(text: string): string {
  let shown = "";
  for (const char of text.normalize("NFC").replaceAll("\t", " ")) {
    if (char === "\n" || isDrawable(char.codePointAt(0) ?? 0)) shown += char;
  }
  return shown.trim();
}

/**
 * pdfkit breaks an unbreakable run character by character, re-measuring the line each time: quadratic in the
 * run length (a 20 000-character token took seconds). A zero-width space every `TOKEN_CHUNK` characters of a
 * run longer than `LONG_TOKEN` (long URLs, pasted garbage) gives the line breaker opportunities; it draws
 * nothing and is present in Source Sans 3.
 */
export function breakLongTokens(text: string): string {
  return text.replace(LONG_TOKEN_PATTERN, (token) => {
    const chars = Array.from(token);
    const parts: string[] = [];
    for (let i = 0; i < chars.length; i += TOKEN_CHUNK) {
      parts.push(chars.slice(i, i + TOKEN_CHUNK).join(""));
    }
    return parts.join(ZERO_WIDTH_SPACE);
  });
}

function isDrawable(codePoint: number): boolean {
  if (codePoint < 0x20 || (codePoint >= 0x7f && codePoint < 0xa0)) return false;
  return FONT_FACES.every((face) => face.hasGlyphForCodePoint(codePoint));
}

function neutralizeMetadata(doc: PDFKit.PDFDocument, id: Uint8Array): void {
  doc.info = {};
  const internals = doc as unknown as PdfKitInternals;
  internals._id = id;
  internals.endMetadata = () => undefined;
}

/** 16 bytes (the size pdfkit uses) of a SHA-256 over the input: stable per CV, independent of the clock. */
function documentId(input: TailoredCvPdfInput): Uint8Array {
  return new Uint8Array(
    createHash("sha256").update(JSON.stringify(input)).digest().subarray(0, 16),
  );
}

function byId<T extends { id: string }>(items: readonly T[], id: string): T {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) throw new TailoredCvRenderError(id);
  return item;
}

function joinSegments(list: CvSegmentList, separator: string): string {
  return list.segments.map((segment) => segment.text.trim()).join(separator);
}

function dateRange(
  start: string | null,
  end: string | null,
  isCurrent: boolean,
  labels: Record<LabelKey, string>,
): string | null {
  const last = isCurrent ? labels.current : end;
  if (start && last) return `${start} – ${last}`;
  return start ?? last ?? null;
}
