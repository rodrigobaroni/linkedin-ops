import {
  type CvStructured,
  CvStructuredSchema,
  type CvTextItem,
  type ValidationIssue,
} from "@linkedin-ops/contracts";
import type { FieldError, FieldErrors, Resolver } from "react-hook-form";
import type { z } from "zod";
import { messages } from "@/i18n/pt-br";

const validation = messages.career.cv.validation;

/**
 * Review sections in Aurora's order (career-screens-spec §2), plus "Outros" (unrecognised CV sections,
 * nothing is dropped). `language` is metadata, never edited.
 */
export const CV_SECTIONS = [
  "contact",
  "summary",
  "experiences",
  "education",
  "skills",
  "languages",
  "certifications",
  "other",
] as const;
export type CvSection = (typeof CV_SECTIONS)[number];

/**
 * Lists of short texts (`{ id, text }`: bullets, skills) are edited as one item per line. Line `i` keeps the
 * id the item at position `i` had; extra lines get new ids. Ids only have to be unique inside the CV version
 * being confirmed (tailoring cites the confirmed version), so positional reuse is safe.
 */
export type CvLines = { text: string; ids: string[] };

/**
 * What the review form edits: `CvStructured` with every nullable text as a string ('' = null) and the
 * `{ id, text }` lists as lines. Item ids are kept; new items get the next free id in the extractor's
 * convention (`exp-3`, `exp-1-b-4`, `skill-t-2`…). Dates stay as printed on the CV (never converted). The
 * contracts schema is the only validation.
 */
export type CvFormValues = {
  language: CvStructured["language"];
  contact: { name: string; email: string; phone: string; location: string; links: string };
  summary: { id: string; text: string };
  experiences: {
    id: string;
    company: string;
    title: string;
    location: string;
    startDate: string;
    endDate: string;
    isCurrent: boolean;
    bullets: CvLines;
    skills: CvLines;
  }[];
  education: {
    id: string;
    institution: string;
    degree: string;
    field: string;
    startDate: string;
    endDate: string;
  }[];
  skills: { technical: CvLines; behavioral: CvLines };
  languages: { id: string; language: string; level: string }[];
  certifications: { id: string; name: string; issuer: string; date: string }[];
  other: { id: string; heading: string; text: string }[];
};

export type CvItemSection = Extract<
  CvSection,
  "experiences" | "education" | "languages" | "certifications" | "other"
>;

/** Id prefix of new top-level items per list. */
const ITEM_PREFIX: Record<CvItemSection, string> = {
  experiences: "exp",
  education: "edu",
  languages: "lang",
  certifications: "cert",
  other: "other",
};

/** Every id in use in the form values (items and line ids). */
function usedIds(values: CvFormValues): Set<string> {
  return new Set([
    values.summary.id,
    ...values.experiences.flatMap((item) => [item.id, ...item.bullets.ids, ...item.skills.ids]),
    ...values.education.map((item) => item.id),
    ...values.skills.technical.ids,
    ...values.skills.behavioral.ids,
    ...values.languages.map((item) => item.id),
    ...values.certifications.map((item) => item.id),
    ...values.other.map((item) => item.id),
  ]);
}

/** `<prefix>-N` with the smallest N above every `<prefix>-N` already used and not taken. */
function nextId(prefix: string, used: Set<string>): string {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  let highest = 0;
  for (const id of used) {
    const match = pattern.exec(id);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  let candidate = highest + 1;
  while (used.has(`${prefix}-${candidate}`)) candidate += 1;
  const id = `${prefix}-${candidate}`;
  used.add(id);
  return id;
}

export function nextItemId(values: CvFormValues, section: CvItemSection): string {
  return nextId(ITEM_PREFIX[section], usedIds(values));
}

export function emptyItem<S extends CvItemSection>(
  values: CvFormValues,
  section: S,
): CvFormValues[S][number] {
  const id = nextItemId(values, section);
  const noLines: CvLines = { text: "", ids: [] };
  const items: { [K in CvItemSection]: CvFormValues[K][number] } = {
    experiences: {
      id,
      company: "",
      title: "",
      location: "",
      startDate: "",
      endDate: "",
      isCurrent: false,
      bullets: noLines,
      skills: noLines,
    },
    education: { id, institution: "", degree: "", field: "", startDate: "", endDate: "" },
    languages: { id, language: "", level: "" },
    certifications: { id, name: "", issuer: "", date: "" },
    other: { id, heading: "", text: "" },
  };
  return items[section];
}

const text = (value: string | null) => value ?? "";
const toLines = (items: readonly CvTextItem[]): CvLines => ({
  text: items.map((item) => item.text).join("\n"),
  ids: items.map((item) => item.id),
});

export function toFormValues(content: CvStructured): CvFormValues {
  const { contact } = content;
  return {
    language: content.language,
    contact: {
      name: text(contact.name),
      email: text(contact.email),
      phone: text(contact.phone),
      location: text(contact.location),
      links: contact.links.join("\n"),
    },
    summary: content.summary ? { ...content.summary } : { id: "summary", text: "" },
    experiences: content.experiences.map((item) => ({
      id: item.id,
      company: item.company,
      title: item.title,
      location: text(item.location),
      startDate: text(item.startDate),
      endDate: text(item.endDate),
      isCurrent: item.isCurrent,
      bullets: toLines(item.bullets),
      skills: toLines(item.skills),
    })),
    education: content.education.map((item) => ({
      ...item,
      degree: text(item.degree),
      field: text(item.field),
      startDate: text(item.startDate),
      endDate: text(item.endDate),
    })),
    skills: {
      technical: toLines(content.skills.technical),
      behavioral: toLines(content.skills.behavioral),
    },
    languages: content.languages.map((item) => ({ ...item, level: text(item.level) })),
    certifications: content.certifications.map((item) => ({
      ...item,
      issuer: text(item.issuer),
      date: text(item.date),
    })),
    other: content.other.map((item) => ({ ...item })),
  };
}

/** Trimmed text, `null` when blank. */
const nullable = (value: string) => value.trim() || null;
const splitLines = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

/** Unvalidated `CvStructured` input: the contracts schema checks it. */
export function toContentInput(values: CvFormValues) {
  const used = usedIds(values);
  /** Line `i` keeps the id at position `i`; extra lines get `<prefix>-N`. */
  const fromLines = (lines: CvLines, prefix: string) =>
    splitLines(lines.text).map((line, index) => ({
      id: lines.ids[index] ?? nextId(prefix, used),
      text: line,
    }));
  const { contact } = values;
  const summary = values.summary.text.trim();
  return {
    language: values.language,
    contact: {
      name: nullable(contact.name),
      email: nullable(contact.email),
      phone: nullable(contact.phone),
      location: nullable(contact.location),
      links: splitLines(contact.links),
    },
    summary: summary ? { id: values.summary.id, text: summary } : null,
    experiences: values.experiences.map((item) => ({
      id: item.id,
      company: item.company.trim(),
      title: item.title.trim(),
      location: nullable(item.location),
      startDate: nullable(item.startDate),
      // A current position has no end date.
      endDate: item.isCurrent ? null : nullable(item.endDate),
      isCurrent: item.isCurrent,
      bullets: fromLines(item.bullets, `${item.id}-b`),
      skills: fromLines(item.skills, `${item.id}-s`),
    })),
    education: values.education.map((item) => ({
      id: item.id,
      institution: item.institution.trim(),
      degree: nullable(item.degree),
      field: nullable(item.field),
      startDate: nullable(item.startDate),
      endDate: nullable(item.endDate),
    })),
    certifications: values.certifications.map((item) => ({
      id: item.id,
      name: item.name.trim(),
      issuer: nullable(item.issuer),
      date: nullable(item.date),
    })),
    skills: {
      technical: fromLines(values.skills.technical, "skill-t"),
      behavioral: fromLines(values.skills.behavioral, "skill-b"),
    },
    languages: values.languages.map((item) => ({
      id: item.id,
      language: item.language.trim(),
      level: nullable(item.level),
    })),
    other: values.other.map((item) => ({
      id: item.id,
      heading: item.heading.trim(),
      text: item.text.trim(),
    })),
  };
}

/** Turns validated form values into `CvStructured` (throws only on values the resolver would reject). */
export function toContent(values: CvFormValues): CvStructured {
  return CvStructuredSchema.parse(toContentInput(values));
}

/** PT-BR messages for the schema's issues (the contracts schema carries no UI copy). */
const ptBrError: z.core.$ZodErrorMap = (issue) => {
  if (issue.code === "too_small" && issue.origin === "string") return validation.required;
  if (issue.code === "too_big") {
    const max = Number(issue.maximum);
    return issue.origin === "array" ? validation.tooMany(max) : validation.tooLong(max);
  }
  return validation.invalid;
};

/** Content paths edited as field arrays: an issue on the array itself goes to its `root`. */
const FIELD_ARRAYS = new Set<string>([
  "experiences",
  "education",
  "languages",
  "certifications",
  "other",
]);
/** Content paths of `{ id, text }` lists edited as lines: every issue goes to the textarea. */
function linesField(parts: readonly string[]): string | null {
  if (parts[0] === "skills" && (parts[1] === "technical" || parts[1] === "behavioral")) {
    return `skills.${parts[1]}.text`;
  }
  if (parts[0] === "experiences" && (parts[2] === "bullets" || parts[2] === "skills")) {
    return `experiences.${parts[1]}.${parts[2]}.text`;
  }
  return null;
}

/** Maps a content path to a form field name (`contact.links.3` → `contact.links`, `summary.text`…). */
export function formFieldFor(path: readonly PropertyKey[]): string {
  const parts = path.map(String);
  const lines = linesField(parts);
  if (lines) return lines;
  if (parts[0] === "contact" && parts[1] === "links") return "contact.links";
  if (parts[0] === "summary") return "summary.text";
  const joined = parts.join(".");
  return FIELD_ARRAYS.has(joined) ? `${joined}.root` : joined;
}

/** Sets `errors[a][b][c]` without overwriting the first error of a field. */
function setError(errors: Record<string, unknown>, name: string, error: FieldError): void {
  const keys = name.split(".");
  let node = errors;
  for (const key of keys.slice(0, -1)) {
    node[key] ??= {};
    node = node[key] as Record<string, unknown>;
  }
  const last = keys[keys.length - 1] as string;
  node[last] ??= error;
}

/**
 * Resolver for one section's editor: validates the whole CV but reports only the issues of `section`, so a
 * section can be saved while another one is still open. Id issues (`ids`) never come from the UI's own
 * allocation and are not shown.
 */
export function sectionResolver(section: CvSection): Resolver<CvFormValues> {
  return async (values) => {
    const parsed = CvStructuredSchema.safeParse(toContentInput(values), { error: ptBrError });
    const issues = parsed.success ? [] : parsed.error.issues.filter((i) => i.path[0] === section);
    if (issues.length === 0) return { values, errors: {} };
    const errors: Record<string, unknown> = {};
    for (const issue of issues) {
      setError(errors, formFieldFor(issue.path), { type: issue.code, message: issue.message });
    }
    return { values: {}, errors: errors as FieldErrors<CvFormValues> };
  };
}

/** Sections a `400 VALIDATION_FAILED` from confirm points at (paths are relative to the body). */
export function sectionsWithIssues(issues: readonly ValidationIssue[]): CvSection[] {
  const sections = new Set<CvSection>();
  for (const issue of issues) {
    const section = issue.path[0] === "content" ? issue.path[1] : undefined;
    if ((CV_SECTIONS as readonly unknown[]).includes(section)) sections.add(section as CvSection);
  }
  return CV_SECTIONS.filter((section) => sections.has(section));
}
