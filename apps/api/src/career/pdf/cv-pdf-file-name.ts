/** Longest slug kept per part, so the whole name stays well under every file system limit. */
const MAX_PART_LENGTH = 40;

export interface CvPdfFileNameParts {
  /** `contact.name` of the base CV; omitted from the name when absent. */
  readonly name: string | null;
  readonly company: string | null;
  readonly title: string | null;
}

/**
 * `CV-<name>-<company>-<title>.pdf` (spec §5 item 7): ASCII letters, digits and hyphens only, so the name is
 * safe in `Content-Disposition` and on any file system (no accents, spaces, separators or `..`).
 */
export function cvPdfFileName(parts: CvPdfFileNameParts): string {
  const slugs = [parts.name, parts.company, parts.title]
    .map((part) => slug(part ?? ""))
    .filter((part) => part.length > 0);
  return `${["CV", ...slugs].join("-")}.pdf`;
}

function slug(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_PART_LENGTH)
    .replace(/-+$/, "");
}
