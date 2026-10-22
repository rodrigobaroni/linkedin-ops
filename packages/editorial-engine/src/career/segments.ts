/** Walks the segments of a tailored CV in display order. */
import type {
  AddedSegmentSection,
  CvSegment,
  CvSegmentList,
  TailoredCvContent,
} from "@linkedin-ops/contracts";
import type { CvBlockKind } from "./lint/cv-banned-phrases.v1.0.0.js";

export interface LocatedSegment {
  segment: CvSegment;
  section: AddedSegmentSection;
  /** Base experience of the segment; null outside experiences. */
  cvExperienceId: string | null;
  /** Lint block kind (humanizer-cv-rules.md §1). */
  block: CvBlockKind;
}

export function listSegments(cv: TailoredCvContent): LocatedSegment[] {
  const located: LocatedSegment[] = [];
  const push = (
    list: CvSegmentList,
    section: AddedSegmentSection,
    cvExperienceId: string | null,
    block: CvBlockKind,
  ) => {
    for (const segment of list.segments) located.push({ segment, section, cvExperienceId, block });
  };
  push(cv.summary, "summary", null, "summary");
  for (const experience of cv.experiences) {
    push(experience.bullets, "experience-bullets", experience.cvExperienceId, "bullet");
    push(experience.skills, "experience-skills", experience.cvExperienceId, "skills");
  }
  push(cv.skills.technical, "skills-technical", null, "skills");
  push(cv.skills.behavioral, "skills-behavioral", null, "skills");
  return located;
}

/** Returns a copy of `cv` with every segment replaced by `fn(segment)`. */
export function mapSegments(
  cv: TailoredCvContent,
  fn: (segment: CvSegment) => CvSegment,
): TailoredCvContent {
  const mapList = (list: CvSegmentList): CvSegmentList => ({ segments: list.segments.map(fn) });
  return {
    ...cv,
    summary: mapList(cv.summary),
    experiences: cv.experiences.map((experience) => ({
      ...experience,
      bullets: mapList(experience.bullets),
      skills: mapList(experience.skills),
    })),
    skills: { technical: mapList(cv.skills.technical), behavioral: mapList(cv.skills.behavioral) },
  };
}
