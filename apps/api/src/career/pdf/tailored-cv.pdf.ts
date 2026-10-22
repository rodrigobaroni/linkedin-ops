import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type {
  CareerLanguage,
  CvSegmentList,
  CvStructured,
  TailoredCvContent,
} from "@linkedin-ops/contracts";
import PDFDocument from "pdfkit";

/**
 * Tailored CV → PDF (spec §5 item 7, D3/D6; ADR-0009). Pure: same input, same bytes.
 *
 * - Only `segment.text` is printed: provenance, ids and addition notes stay in the review UI (spec §8, D4).
 * - Contact, company, title, dates, education, certifications and languages come from the base CV by id.
 * - Neutral metadata: empty Info dictionary (no Producer, Creator or dates), no XMP packet, and a document
 *   `/ID` derived from the input instead of the clock.
 * - Embedded subset of Source Sans 3 (OFL, `apps/api/assets/fonts`): selectable text with PT accents.
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

/** Resolved relative to this module: `src/career/pdf` and `dist/career/pdf` sit at the same depth. */
const FONT_DIR = new URL("../../../assets/fonts/", import.meta.url);
const FONTS = {
  regular: readFileSync(new URL("SourceSans3-Regular.ttf", FONT_DIR)),
  semibold: readFileSync(new URL("SourceSans3-Semibold.ttf", FONT_DIR)),
};

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
 * `info` is written as the Info dictionary at `end()`, `_id` is the trailer `/ID`, and `endMetadata()`
 * writes the XMP packet (CreateDate, CreatorTool, Producer).
 */
interface PdfKitInternals {
  info: Record<string, unknown>;
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
    document.add(
      doc.struct(tag, {}, () => {
        doc
          .font(font)
          .fontSize(size)
          .fillColor(color)
          .text(text, { width, ...options });
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

  const list = (items: readonly string[]): void => {
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

function neutralizeMetadata(doc: PDFKit.PDFDocument, id: Uint8Array): void {
  const internals = doc as unknown as PdfKitInternals;
  internals.info = {};
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
