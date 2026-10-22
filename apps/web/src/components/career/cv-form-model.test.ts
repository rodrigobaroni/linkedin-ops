import { describe, expect, it } from "vitest";
import { messages } from "@/i18n/pt-br";
import { MOCK_CV_CONTENT } from "@/mocks/career-handlers";
import {
  type CvFormValues,
  type CvSection,
  emptyItem,
  formFieldFor,
  nextItemId,
  sectionResolver,
  sectionsWithIssues,
  toContent,
  toFormValues,
} from "./cv-form-model";

const validation = messages.career.cv.validation;

async function resolve(section: CvSection, values: CvFormValues) {
  return sectionResolver(section)(values, undefined, {
    fields: {},
    shouldUseNativeValidation: false,
  });
}

describe("cv form model", () => {
  it("round-trips CvStructured through the form (nulls as '', { id, text } lists as lines)", () => {
    const values = toFormValues(MOCK_CV_CONTENT);
    expect(values.experiences[0]?.endDate).toBe("");
    expect(values.experiences[0]?.bullets).toEqual({
      text: "Liderou a migração de um monólito para serviços.\nMentorou quatro pessoas.",
      ids: ["exp-1-b-1", "exp-1-b-2"],
    });
    expect(values.skills.technical.text).toBe("TypeScript\nReact");
    expect(toContent(values)).toEqual(MOCK_CV_CONTENT);
  });

  it("keeps dates as printed, trims, turns blanks into null and clears the end date of a current job", () => {
    const values = toFormValues(MOCK_CV_CONTENT);
    values.contact.name = "  Ana  ";
    values.contact.phone = "   ";
    values.summary.text = "  ";
    values.experiences[1]!.isCurrent = true;
    const content = toContent(values);
    expect(content.contact.name).toBe("Ana");
    expect(content.contact.phone).toBeNull();
    expect(content.summary).toBeNull();
    expect(content.experiences[1]?.startDate).toBe("mar. 2016");
    expect(content.experiences[1]?.endDate).toBeNull();
  });

  it("lines keep their position's id and new lines get the next free id of their list", () => {
    const values = toFormValues(MOCK_CV_CONTENT);
    values.experiences[0]!.bullets.text = "  Primeira reescrita \n\n Segunda \nTerceira nova\r\n";
    values.skills.technical.text = "TypeScript\nReact\nKotlin";
    values.experiences[1]!.skills.text = "Figma";
    const content = toContent(values);
    expect(content.experiences[0]?.bullets).toEqual([
      { id: "exp-1-b-1", text: "Primeira reescrita" },
      { id: "exp-1-b-2", text: "Segunda" },
      { id: "exp-1-b-3", text: "Terceira nova" },
    ]);
    expect(content.skills.technical.map((item) => item.id)).toEqual([
      "skill-t-1",
      "skill-t-2",
      "skill-t-3",
    ]);
    expect(content.experiences[1]?.skills).toEqual([{ id: "exp-2-s-1", text: "Figma" }]);
  });

  it("new items get the next free id of their kind", () => {
    const values = toFormValues(MOCK_CV_CONTENT);
    expect(nextItemId(values, "experiences")).toBe("exp-3");
    expect(nextItemId(values, "other")).toBe("other-2");
    expect(emptyItem(values, "certifications")).toEqual({
      id: "cert-2",
      name: "",
      issuer: "",
      date: "",
    });
  });

  it("reports only the edited section's issues, in PT-BR", async () => {
    const values = toFormValues(MOCK_CV_CONTENT);
    values.experiences[0]!.title = "   ";
    values.languages.push({ id: "lang-3", language: "", level: "" });
    values.skills.behavioral.text = "x".repeat(2001);

    const experiences = await resolve("experiences", values);
    expect(experiences.errors.experiences?.[0]?.title?.message).toBe(validation.required);
    expect(experiences.errors.languages).toBeUndefined();
    expect((await resolve("languages", values)).errors.languages?.[2]?.language?.message).toBe(
      validation.required,
    );
    expect((await resolve("skills", values)).errors.skills?.behavioral?.text?.message).toBe(
      validation.tooLong(2000),
    );
    expect((await resolve("contact", values)).errors).toEqual({});
  });

  it("formFieldFor sends line items to their textarea and array issues to root", () => {
    expect(formFieldFor(["contact", "links", 0])).toBe("contact.links");
    expect(formFieldFor(["experiences", 0, "bullets", 2, "text"])).toBe(
      "experiences.0.bullets.text",
    );
    expect(formFieldFor(["skills", "technical", 1, "text"])).toBe("skills.technical.text");
    expect(formFieldFor(["summary", "text"])).toBe("summary.text");
    expect(formFieldFor(["experiences", 0, "title"])).toBe("experiences.0.title");
    expect(formFieldFor(["other"])).toBe("other.root");
  });

  it("sectionsWithIssues lists the sections of a confirm VALIDATION_FAILED, in screen order", () => {
    expect(
      sectionsWithIssues([
        { path: ["content", "other", 0, "heading"], message: "x" },
        { path: ["content", "contact", "email"], message: "x" },
        { path: ["draftId"], message: "x" },
      ]),
    ).toEqual(["contact", "other"]);
  });
});
