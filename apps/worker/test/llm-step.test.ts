/** Regeneration with feedback in the worker loop (issue #99, Pena cv-tailor-1.1.0.md §4.1). */
import {
  LlmError,
  type BuiltRequest,
  type EngineError,
  type LlmClient,
  type Result,
  type TailorIssue,
} from "@linkedin-ops/editorial-engine";
import { describe, expect, it } from "vitest";
import { PermanentJobError, RetryableJobError } from "../src/jobs/errors.js";
import { runLlmStepWithRegenerations } from "../src/career/llm-step.js";

const built = (tag: string): BuiltRequest => ({
  request: {
    promptId: "cv-tailor",
    promptVersion: "1.1.0",
    model: "gpt-test",
    instructions: "i",
    input: tag,
    maxOutputTokens: 10,
    outputSchema: {},
    outputSchemaName: "x",
  } as unknown as BuiltRequest["request"],
  truncated: false,
  preflightInjectionFlags: [],
});

const ISSUE: TailorIssue = {
  code: "invented_role_title",
  where: "seg-7",
  excerpt: "data engineer",
};

/** Answers `outputs` in order; an `Error` is thrown instead of answered. */
function llm(outputs: (unknown | Error)[]): LlmClient {
  let call = 0;
  return {
    complete: async () => {
      const next = outputs[call++];
      if (next instanceof Error) throw next;
      return { output: next, model: "gpt-test" } as Awaited<ReturnType<LlmClient["complete"]>>;
    },
  } as unknown as LlmClient;
}

const parse = (raw: unknown): Result<string, EngineError> =>
  raw === "bad"
    ? {
        ok: false,
        error: {
          code: "SEMANTIC_INVALID",
          issues: ["seg-7: hard limit, invented role title"],
          feedback: [ISSUE],
        },
      }
    : { ok: true, value: String(raw) };

describe("runLlmStepWithRegenerations with feedback (issue #99)", () => {
  it("the next attempt's build receives exactly the last invalid attempt's issues", async () => {
    const seen: (readonly TailorIssue[] | undefined)[] = [];
    const logged: unknown[] = [];
    const outcome = await runLlmStepWithRegenerations(
      llm(["bad", "good"]),
      (previous) => (seen.push(previous), built("x")),
      parse,
      new AbortController().signal,
      2,
      (attempt, reason, issues) => logged.push({ attempt, reason, issues }),
    );
    expect(outcome.value).toBe("good");
    expect(seen).toEqual([undefined, [ISSUE]]);
    expect(JSON.stringify(logged)).toContain("seg-7");
    expect(JSON.stringify(logged)).toContain("invented_role_title");
    expect(JSON.stringify(logged)).not.toContain("data engineer");
  });

  it("an LLM schema failure becomes one schema_invalid issue", async () => {
    const seen: (readonly TailorIssue[] | undefined)[] = [];
    await runLlmStepWithRegenerations(
      llm([new LlmError("INVALID_OUTPUT"), "good"]),
      (previous) => (seen.push(previous), built("x")),
      parse,
      new AbortController().signal,
      2,
    );
    expect(seen).toEqual([undefined, [{ code: "schema_invalid", where: "(root)" }]]);
  });

  it("a transient error leaves the loop for a queue retry, without feedback (Maestro D2)", async () => {
    await expect(
      runLlmStepWithRegenerations(
        llm(["bad", new LlmError("TIMEOUT")]),
        () => built("x"),
        parse,
        new AbortController().signal,
        2,
      ),
    ).rejects.toBeInstanceOf(RetryableJobError);
  });

  it("gives up after the regenerations, permanently", async () => {
    await expect(
      runLlmStepWithRegenerations(
        llm(["bad", "bad", "bad"]),
        () => built("x"),
        parse,
        new AbortController().signal,
        2,
      ),
    ).rejects.toBeInstanceOf(PermanentJobError);
  });
});
