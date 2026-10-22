import { describe, expect, it } from "vitest";
import { messages } from "@/i18n/pt-br";
import { jobName } from "./job-status";

describe("jobName", () => {
  it("title, else domain, else 'Vaga sem título'", () => {
    expect(jobName({ title: "Engenheira", url: "https://empresa.com/v" })).toBe("Engenheira");
    expect(jobName({ title: null, url: "https://www.empresa.com/v" })).toBe("empresa.com");
    expect(jobName({ title: "  ", url: "https://empresa.com/v" })).toBe("empresa.com");
    expect(jobName({ title: null, url: "" })).toBe(messages.career.jobs.detail.untitled);
  });
});
