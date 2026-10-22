/**
 * Released prompts are immutable (ADR-0005 §3, Crivo PR89-5): the SHA-256 of every `instructions` text,
 * preamble included, is pinned per `promptId@version`. Changing a text without a new version fails here; a new
 * version adds a new line to `PINNED` (old lines stay). The texts must also match Pena's canonical document.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CAREER_PROMPTS, CAREER_SECURITY_PREAMBLE } from "../src/index.js";

const PINNED: Record<string, string> = {
  "cv-extract@1.0.0": "373feaa03d456afbe89210fd7bded7b3a30ec7da14edd7e0d02ee0d7d98e67f0",
  "job-extract@1.0.0": "82912917fc1668adbb94caabc9a594e2a9f1ae510917ef99ba14a6e17f5bcdf9",
  "cv-tailor@1.0.0": "013b0988c871d1ae431f5cfd2302e30d8a408a137380382fdb06249f33a9b92f",
  "cv-humanize@1.0.0": "5afbe845217835e23bfb4968a6c3d53c6b481d336b09302f34c88dc96bbcbe40",
};

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const DOC = readFileSync(
  join(import.meta.dirname, "..", "..", "..", "docs", "editorial", "career-prompts.md"),
  "utf8",
);

describe("career prompts are immutable once released", () => {
  for (const prompt of Object.values(CAREER_PROMPTS)) {
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
