/**
 * Released prompts are immutable (ADR-0005 §3, Crivo PR89-5): the SHA-256 of every `instructions` text,
 * preamble included, is pinned per `promptId@version`. Changing a text without a new version fails here; a new
 * version adds a new line to `PINNED` (old lines stay). The texts must also match Pena's canonical document.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CAREER_PROMPTS, CAREER_SECURITY_PREAMBLE, type PromptDefinition } from "../src/index.js";
import { CV_EXTRACT_V1_0_0 } from "../src/prompts/cv-extract/v1.0.0.js";
import { CV_HUMANIZE_V1_0_0 } from "../src/prompts/cv-humanize/v1.0.0.js";
import { CV_TAILOR_V1_0_0 } from "../src/prompts/cv-tailor/v1.0.0.js";
import { CV_TAILOR_V1_1_0 } from "../src/prompts/cv-tailor/v1.1.0.js";
import { JOB_EXTRACT_V1_0_0 } from "../src/prompts/job-extract/v1.0.0.js";

/** Every released prompt version, in use or not (a superseded one must still match its pin; QA of #109). */
const RELEASED: readonly PromptDefinition[] = [
  CV_EXTRACT_V1_0_0,
  JOB_EXTRACT_V1_0_0,
  CV_TAILOR_V1_0_0,
  CV_TAILOR_V1_1_0,
  CV_HUMANIZE_V1_0_0,
];

const PINNED: Record<string, string> = {
  "cv-extract@1.0.0": "373feaa03d456afbe89210fd7bded7b3a30ec7da14edd7e0d02ee0d7d98e67f0",
  "job-extract@1.0.0": "82912917fc1668adbb94caabc9a594e2a9f1ae510917ef99ba14a6e17f5bcdf9",
  "cv-tailor@1.0.0": "013b0988c871d1ae431f5cfd2302e30d8a408a137380382fdb06249f33a9b92f",
  "cv-tailor@1.1.0": "60895cab62479fe21988e9210975f0ee28b0e838e2ef7ae1bd39bb27f3a5e9da",
  "cv-humanize@1.0.0": "5afbe845217835e23bfb4968a6c3d53c6b481d336b09302f34c88dc96bbcbe40",
};

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const DOC = readFileSync(
  join(import.meta.dirname, "..", "..", "..", "docs", "editorial", "career-prompts.md"),
  "utf8",
);

describe("career prompts are immutable once released", () => {
  it("every pin is checked: each pinned version is released, each released version is pinned and in use or kept", () => {
    const released = RELEASED.map((prompt) => `${prompt.id}@${prompt.version}`).sort();
    expect(Object.keys(PINNED).sort()).toEqual(released);
    const files = readdirSync(join(import.meta.dirname, "..", "src", "prompts"), {
      recursive: true,
    })
      .map(String)
      .filter((file) => /v\d+\.\d+\.\d+\.ts$/.test(file))
      .map((file) => file.replace(/\\/g, "/").replace(/\/v(\d+\.\d+\.\d+)\.ts$/, "@$1"))
      .sort();
    expect(files).toEqual(released);
    for (const prompt of Object.values(CAREER_PROMPTS)) expect(RELEASED).toContain(prompt);
  });

  for (const prompt of RELEASED) {
    const key = `${prompt.id}@${prompt.version}`;

    it(`${key} matches its pinned hash`, () => {
      expect(
        PINNED[key],
        `${key} is not pinned: add its hash (a new version, never an edit)`,
      ).toBeDefined();
      expect(sha256(prompt.instructions)).toBe(PINNED[key]);
    });

    it(`${key} matches docs/editorial/career-prompts.md`, () => {
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const match = new RegExp(
        `\\*\\*Texto de sistema \\(\`${escaped}\`\\)\\*\\*:\\s*\`\`\`text\\n<preâmbulo comum §0\\.2>\\n\\n([\\s\\S]*?)\`\`\``,
      ).exec(DOC);
      expect(match, `${key} not found in the document`).not.toBeNull();
      expect(prompt.instructions).toBe(
        `${CAREER_SECURITY_PREAMBLE}\n\n${(match?.[1] ?? "").trimEnd()}`,
      );
    });
  }

  it("the shared preamble matches §0.2 of the document", () => {
    const match = /### 0\.2[\s\S]*?```text\n([\s\S]*?)```/.exec(DOC);
    expect(CAREER_SECURITY_PREAMBLE).toBe((match?.[1] ?? "").trimEnd());
  });
});
