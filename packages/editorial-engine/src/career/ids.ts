/**
 * Id normalization after `cv-extract` (career-prompts.md §1: ids are assigned by the model and normalized by
 * code). Canonical ids depend only on position, so a re-extraction of the same CV yields the same ids.
 */
import type { CvExtractionOutput, CvStructured } from "@linkedin-ops/contracts";

export function normalizeCvIds(output: CvExtractionOutput): CvStructured {
  return {
    language: output.language,
    contact: output.contact,
    summary: output.summary ? { id: "summary", text: output.summary.text } : null,
    experiences: output.experiences.map((experience, index) => {
      const id = `exp-${index + 1}`;
      return {
        ...experience,
        id,
        bullets: experience.bullets.map((bullet, b) => ({
          id: `${id}-b-${b + 1}`,
          text: bullet.text,
        })),
        skills: experience.skills.map((skill, s) => ({ id: `${id}-s-${s + 1}`, text: skill.text })),
      };
    }),
    education: output.education.map((item, index) => ({ ...item, id: `edu-${index + 1}` })),
    certifications: output.certifications.map((item, index) => ({
      ...item,
      id: `cert-${index + 1}`,
    })),
    skills: {
      technical: output.skills.technical.map((item, index) => ({
        id: `skill-t-${index + 1}`,
        text: item.text,
      })),
      behavioral: output.skills.behavioral.map((item, index) => ({
        id: `skill-b-${index + 1}`,
        text: item.text,
      })),
    },
    languages: output.languages.map((item, index) => ({ ...item, id: `lang-${index + 1}` })),
    other: output.other.map((item, index) => ({ ...item, id: `other-${index + 1}` })),
  };
}

/**
 * Text of every base CV item, by id, for evidence and provenance checks. An experience id covers its own
 * fields plus its bullets and skills.
 */
export function cvItemTexts(cv: CvStructured): Map<string, string> {
  const texts = new Map<string, string>();
  const join = (...parts: (string | null)[]) => parts.filter((part) => part !== null).join("\n");
  if (cv.summary) texts.set(cv.summary.id, cv.summary.text);
  for (const experience of cv.experiences) {
    texts.set(
      experience.id,
      join(
        experience.company,
        experience.title,
        experience.location,
        experience.startDate,
        experience.endDate,
        ...experience.bullets.map((bullet) => bullet.text),
        ...experience.skills.map((skill) => skill.text),
      ),
    );
    for (const item of [...experience.bullets, ...experience.skills]) texts.set(item.id, item.text);
  }
  for (const item of cv.education) {
    texts.set(
      item.id,
      join(item.institution, item.degree, item.field, item.startDate, item.endDate),
    );
  }
  for (const item of cv.certifications) texts.set(item.id, join(item.name, item.issuer, item.date));
  for (const item of [...cv.skills.technical, ...cv.skills.behavioral])
    texts.set(item.id, item.text);
  for (const item of cv.languages) texts.set(item.id, join(item.language, item.level));
  for (const item of cv.other) texts.set(item.id, join(item.heading, item.text));
  return texts;
}

/** Whole base CV as one text (numbers check of added segments). Contact data is excluded. */
export function cvFullText(cv: CvStructured): string {
  return [...cvItemTexts(cv).values()].join("\n");
}
