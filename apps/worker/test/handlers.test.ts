import { pino } from "pino";
import { describe, expect, it } from "vitest";
import { SimulatedLlmClient, type SimulatedOutput } from "@linkedin-ops/editorial-engine";
import { PermanentJobError, RetryableJobError } from "../src/jobs/errors.js";
import type { JobContext } from "../src/jobs/runner.js";
import { createCareerHandlers, isLinkedInUrl } from "../src/career/handlers.js";
import {
  JobFetchError,
  unavailableJobPageFetcher,
  type CvBaseDraftStore,
  type JobPageFetcher,
  type JobPostingSource,
  type JobPostingStore,
} from "../src/career/ports.js";
import {
  IDS,
  baseCv,
  cvExtractionOutput,
  cvText,
  envelope,
  humanizeOutput,
  job,
  jobExtractionOutput,
  postingText,
  tailoringOutput,
} from "./fixtures.js";

const rng = { hex: (n: number) => "b".repeat(n) };

function context(overrides: Partial<JobContext> = {}): JobContext {
  return {
    jobId: "job-1",
    retryCount: 0,
    isLastAttempt: false,
    signal: new AbortController().signal,
    logger: pino({ level: "silent" }),
    ...overrides,
  };
}

function fakeStores(source: JobPostingSource | null = { kind: "pasted", text: postingText }) {
  const events: string[] = [];
  const saved: Record<string, unknown> = {};
  const cvStore: CvBaseDraftStore = {
    loadForExtraction: () => Promise.resolve({ text: cvText }),
    completeExtraction: (_id, result) => (
      (saved.cv = result),
      events.push("cv:extracted"),
      Promise.resolve()
    ),
    markFailed: (_id, reason) => (events.push(`cv:failed:${reason}`), Promise.resolve()),
  };
  const jobStore: JobPostingStore = {
    loadForFetch: () => Promise.resolve(source ? { source } : null),
    completeExtraction: (_id, result) => (
      (saved.job = result),
      events.push("job:extracted"),
      Promise.resolve()
    ),
    loadForTailoring: () =>
      Promise.resolve({
        cvBaseId: IDS.cvBase,
        base: baseCv,
        job,
        rawText: postingText,
        jobInjectionSuspected: false,
      }),
    completeTailoring: (_id, result) => (
      (saved.tailored = result),
      events.push("job:tailored"),
      Promise.resolve()
    ),
    markFailed: (_id, reason) => (events.push(`job:failed:${reason}`), Promise.resolve()),
  };
  return { cvStore, jobStore, events, saved };
}

function handlers(
  outputs: Partial<
    Record<"cv-extract" | "job-extract" | "cv-tailor" | "cv-humanize", SimulatedOutput>
  >,
  stores = fakeStores(),
  fetcher: JobPageFetcher = unavailableJobPageFetcher,
  linkedInFetchEnabled = true,
) {
  const llm = new SimulatedLlmClient(outputs);
  return {
    llm,
    ...stores,
    h: createCareerHandlers({
      llm,
      model: "gpt-test",
      rng,
      ...stores,
      fetcher,
      linkedInFetchEnabled,
    }),
  };
}

const segmentTexts = {
  "seg-1": "Backend engineer with 8 years in payments.",
  "seg-2": "Led the migration of the billing service to durable queues.",
  "seg-3": "Evaluated Kafka for event streaming.",
  "seg-4": "TypeScript",
};

describe("cv.extract", () => {
  it("stores the extracted draft with canonical ids and generation info", async () => {
    const { h, events, saved } = handlers({ "cv-extract": cvExtractionOutput });
    await h["cv.extract"]({ ...envelope, cvBaseId: IDS.cvBase }, context());
    expect(events).toEqual(["cv:extracted"]);
    expect(saved.cv).toMatchObject({
      cv: baseCv,
      generation: { model: "simulated:gpt-test", promptVersions: { "cv-extract": "1.0.0" } },
    });
  });

  it("fails a document that is not a CV", async () => {
    const { h, events } = handlers({
      "cv-extract": {
        ...cvExtractionOutput,
        parseWarnings: [{ field: "document", message: "not_a_cv" }],
      },
    });
    await h["cv.extract"]({ ...envelope, cvBaseId: IDS.cvBase }, context());
    expect(events).toEqual(["cv:failed:not_a_cv"]);
  });

  it("retries invalid model output and marks `ai` only on the last attempt", async () => {
    const { h, events } = handlers({ "cv-extract": { nonsense: true } });
    const payload = { ...envelope, cvBaseId: IDS.cvBase };
    await expect(h["cv.extract"](payload, context())).rejects.toBeInstanceOf(RetryableJobError);
    expect(events).toEqual([]);
    await expect(h["cv.extract"](payload, context({ isLastAttempt: true }))).rejects.toBeInstanceOf(
      RetryableJobError,
    );
    expect(events).toEqual(["cv:failed:ai"]);
  });

  it("exits quietly when the draft is no longer extracting (idempotent)", async () => {
    const stores = fakeStores();
    stores.cvStore.loadForExtraction = () => Promise.resolve(null);
    const { h, llm } = handlers({}, stores);
    await h["cv.extract"]({ ...envelope, cvBaseId: IDS.cvBase }, context());
    expect(llm.calls).toEqual([]);
  });
});

describe("job.fetch", () => {
  it("extracts a pasted posting and hands over to the store (which enqueues cv.tailor)", async () => {
    const { h, events, saved } = handlers({ "job-extract": jobExtractionOutput });
    await h["job.fetch"]({ ...envelope, jobPostingId: IDS.posting }, context());
    expect(events).toEqual(["job:extracted"]);
    expect(saved.job).toMatchObject({ job, droppedRequirementCount: 0, rawText: postingText });
  });

  it("sends URLs to paste-text until the PR 3 fetcher exists", async () => {
    const { h, events, llm } = handlers(
      {},
      fakeStores({ kind: "url", url: "https://jobs.example.com/1" }),
    );
    await h["job.fetch"]({ ...envelope, jobPostingId: IDS.posting }, context());
    expect(events).toEqual(["job:failed:fetch"]);
    expect(llm.calls).toEqual([]);
  });

  it("honours the JOB_FETCH_LINKEDIN kill switch without fetching", async () => {
    let fetched = false;
    const fetcher: JobPageFetcher = {
      fetchJobText: () => ((fetched = true), Promise.resolve({ text: "" })),
    };
    const { h, events } = handlers(
      {},
      fakeStores({ kind: "url", url: "https://www.linkedin.com/jobs/view/123" }),
      fetcher,
      false,
    );
    await h["job.fetch"]({ ...envelope, jobPostingId: IDS.posting }, context());
    expect(events).toEqual(["job:failed:fetch"]);
    expect(fetched).toBe(false);
  });

  it("stops on a blocked fetch (no retry) and retries transient fetch errors", async () => {
    const blocked: JobPageFetcher = {
      fetchJobText: () => Promise.reject(new JobFetchError("blocked")),
    };
    const transient: JobPageFetcher = {
      fetchJobText: () => Promise.reject(new JobFetchError("transient")),
    };
    const url = { kind: "url" as const, url: "https://jobs.example.com/1" };
    const a = handlers({}, fakeStores(url), blocked);
    await a.h["job.fetch"]({ ...envelope, jobPostingId: IDS.posting }, context());
    expect(a.events).toEqual(["job:failed:fetch_blocked"]);
    const b = handlers({}, fakeStores(url), transient);
    await expect(
      b.h["job.fetch"]({ ...envelope, jobPostingId: IDS.posting }, context()),
    ).rejects.toBeInstanceOf(RetryableJobError);
    expect(b.events).toEqual([]);
  });

  it("fails `not_a_job` for a login wall", async () => {
    const { h, events } = handlers({
      "job-extract": {
        ...jobExtractionOutput,
        isJobPosting: false,
        notAJobReason: "login wall",
        title: null,
        requirements: [],
      },
    });
    await h["job.fetch"]({ ...envelope, jobPostingId: IDS.posting }, context());
    expect(events).toEqual(["job:failed:not_a_job"]);
  });

  it("recognizes LinkedIn hosts only", () => {
    expect(isLinkedInUrl("https://www.linkedin.com/jobs/view/1")).toBe(true);
    expect(isLinkedInUrl("https://linkedin.com.evil.example/jobs")).toBe(false);
    expect(isLinkedInUrl("not a url")).toBe(false);
  });
});

describe("cv.tailor", () => {
  it("tailors, humanizes once when clean, and stores content + report", async () => {
    const { h, events, saved, llm } = handlers({
      "cv-tailor": tailoringOutput(),
      "cv-humanize": humanizeOutput({}, segmentTexts),
    });
    await h["cv.tailor"]({ ...envelope, jobPostingId: IDS.posting }, context());
    expect(events).toEqual(["job:tailored"]);
    expect(llm.calls.map((c) => c.promptId)).toEqual(["cv-tailor", "cv-humanize"]);
    const tailored = saved.tailored as {
      report: { baseScore: number; added: unknown[]; humanizer: unknown };
    };
    // mandatory met (1 × 0.7) + desirable missing (0 × 0.3) = 70; the added Kafka bullet does not count.
    expect(tailored.report.baseScore).toBe(70);
    expect(tailored.report.added).toHaveLength(1);
    expect(tailored.report.humanizer).toMatchObject({ passed: true, regenerations: 0 });
  });

  it("regenerates the humanizer at most twice, then delivers and flags", async () => {
    const tellBullet = "Passionate about migrating the billing service to durable queues.";
    const { h, saved, llm } = handlers({
      "cv-tailor": tailoringOutput(tellBullet),
      "cv-humanize": humanizeOutput({}, { ...segmentTexts, "seg-2": tellBullet }),
    });
    await h["cv.tailor"]({ ...envelope, jobPostingId: IDS.posting }, context());
    expect(llm.calls.filter((c) => c.promptId === "cv-humanize")).toHaveLength(3);
    const report = (saved.tailored as { report: { humanizer: Record<string, unknown> } }).report;
    expect(report.humanizer).toMatchObject({
      passed: false,
      regenerations: 2,
      failedRuleIds: ["cv.en.self-praise.passionate"],
    });
  });

  it("stops regenerating as soon as the checker passes", async () => {
    const tellBullet = "Passionate about migrating the billing service to durable queues.";
    const { h, saved, llm } = handlers({
      "cv-tailor": tailoringOutput(tellBullet),
      "cv-humanize": (_request, call) =>
        call === 0
          ? humanizeOutput({}, { ...segmentTexts, "seg-2": tellBullet })
          : humanizeOutput(
              { "seg-2": "Migrated the billing service to durable queues." },
              segmentTexts,
            ),
    });
    await h["cv.tailor"]({ ...envelope, jobPostingId: IDS.posting }, context());
    expect(llm.calls.filter((c) => c.promptId === "cv-humanize")).toHaveLength(2);
    const report = (saved.tailored as { report: { humanizer: Record<string, unknown> } }).report;
    expect(report.humanizer).toMatchObject({ passed: true, regenerations: 1 });
  });

  it("rejects an added number (D4 hard limit) as invalid output and fails `ai` on the last attempt", async () => {
    const output = tailoringOutput();
    const added = output.tailoredCv.experiences[0]?.bullets.segments[1];
    if (added) added.text = "Cut Kafka lag by 35%.";
    const { h, events } = handlers({ "cv-tailor": output });
    await expect(
      h["cv.tailor"]({ ...envelope, jobPostingId: IDS.posting }, context({ isLastAttempt: true })),
    ).rejects.toBeInstanceOf(RetryableJobError);
    expect(events).toEqual(["job:failed:ai"]);
  });

  it("treats auth/refusal LLM errors as permanent", async () => {
    const { LlmError } = await import("@linkedin-ops/editorial-engine");
    const { h, events } = handlers({
      "cv-tailor": () => {
        throw new LlmError("AUTH", { status: 401 });
      },
    });
    await expect(
      h["cv.tailor"]({ ...envelope, jobPostingId: IDS.posting }, context()),
    ).rejects.toBeInstanceOf(PermanentJobError);
    expect(events).toEqual(["job:failed:ai"]);
  });
});
