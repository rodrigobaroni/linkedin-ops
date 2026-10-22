import { pino } from "pino";
import { describe, expect, it } from "vitest";
import { SimulatedLlmClient, type SimulatedOutput } from "@linkedin-ops/editorial-engine";
import {
  CancelledJobError,
  PermanentJobError,
  RescheduleJobError,
  RetryableJobError,
} from "../src/jobs/errors.js";
import type { JobContext } from "../src/jobs/runner.js";
import { createCareerHandlers, isLinkedInUrl } from "../src/career/handlers.js";
import type { CvBaseDraftStore, JobPostingSource, JobPostingStore } from "@linkedin-ops/domain";
import {
  JobFetchDeferredError,
  JobFetchError,
  unavailableJobPageFetcher,
  type JobPageFetcher,
} from "../src/career/ports.js";
import { wireCareer } from "../src/career/wiring.js";
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
    completeExtraction: (_id, result, meta) => (
      (saved.cv = result),
      (saved.cvMeta = meta),
      events.push("cv:extracted"),
      Promise.resolve()
    ),
    markFailed: (_id, reason, meta) => (
      (saved.cvMeta = meta),
      events.push(`cv:failed:${reason}`),
      Promise.resolve()
    ),
  };
  let fetchedText: string | null = null;
  const jobStore: JobPostingStore = {
    loadForFetch: () => Promise.resolve(source ? { source, fetchedText } : null),
    saveFetchedText: (_id, text) => (
      (fetchedText = text),
      events.push("job:fetched"),
      Promise.resolve()
    ),
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
    // The store audits the write as this job (actor WORKER).
    expect(saved.cvMeta).toEqual({ jobId: "job-1", correlationId: envelope.correlationId });
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
    const { h, events, saved } = handlers({ "cv-extract": { nonsense: true } });
    const payload = { ...envelope, cvBaseId: IDS.cvBase };
    await expect(h["cv.extract"](payload, context())).rejects.toBeInstanceOf(RetryableJobError);
    expect(events).toEqual([]);
    await expect(h["cv.extract"](payload, context({ isLastAttempt: true }))).rejects.toBeInstanceOf(
      RetryableJobError,
    );
    expect(events).toEqual(["cv:failed:ai"]);
    expect(saved.cvMeta).toEqual({ jobId: "job-1", correlationId: envelope.correlationId });
  });

  it("a cancellation on the LAST attempt never fails the draft", async () => {
    const { LlmError } = await import("@linkedin-ops/editorial-engine");
    const { h, events } = handlers({
      "cv-extract": () => {
        throw new LlmError("ABORTED");
      },
    });
    await expect(
      h["cv.extract"](
        { ...envelope, cvBaseId: IDS.cvBase },
        context({ retryCount: 2, isLastAttempt: true }),
      ),
    ).rejects.toBeInstanceOf(CancelledJobError);
    expect(events).toEqual([]);
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
    await h["job.fetch"]({ ...envelope, jobPostingId: IDS.posting, attempt: 1 }, context());
    expect(events).toEqual(["job:extracted"]);
    expect(saved.job).toMatchObject({ job, droppedRequirementCount: 0, rawText: postingText });
  });

  it("sends URLs to paste-text until the PR 3 fetcher exists", async () => {
    const { h, events, llm } = handlers(
      {},
      fakeStores({ kind: "url", url: "https://jobs.example.com/1" }),
    );
    await h["job.fetch"]({ ...envelope, jobPostingId: IDS.posting, attempt: 1 }, context());
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
    await h["job.fetch"]({ ...envelope, jobPostingId: IDS.posting, attempt: 1 }, context());
    expect(events).toEqual(["job:failed:fetch_blocked"]);
    expect(fetched).toBe(false);
    // lnkd.in is LinkedIn too: refused before any request (Maestro D2).
    const short = handlers(
      {},
      fakeStores({ kind: "url", url: "https://lnkd.in/abc123" }),
      fetcher,
      false,
    );
    await short.h["job.fetch"]({ ...envelope, jobPostingId: IDS.posting, attempt: 1 }, context());
    expect(short.events).toEqual(["job:failed:fetch_blocked"]);
    expect(fetched).toBe(false);
  });

  it("reschedules a deferred fetch without marking the posting failed", async () => {
    const at = new Date("2026-10-22T12:00:15.000Z");
    const deferred: JobPageFetcher = {
      fetchJobText: () => Promise.reject(new JobFetchDeferredError(at)),
    };
    const { h, events } = handlers(
      {},
      fakeStores({ kind: "url", url: "https://jobs.example.com/1" }),
      deferred,
    );
    const error = await h["job.fetch"](
      { ...envelope, jobPostingId: IDS.posting, attempt: 1 },
      context({ isLastAttempt: true }),
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RescheduleJobError);
    expect((error as RescheduleJobError).startAfter).toEqual(at);
    expect(events).toEqual([]);
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
    await a.h["job.fetch"]({ ...envelope, jobPostingId: IDS.posting, attempt: 1 }, context());
    expect(a.events).toEqual(["job:failed:fetch_blocked"]);
    const b = handlers({}, fakeStores(url), transient);
    await expect(
      b.h["job.fetch"]({ ...envelope, jobPostingId: IDS.posting, attempt: 1 }, context()),
    ).rejects.toBeInstanceOf(RetryableJobError);
    expect(b.events).toEqual([]);
  });

  it("invalid AI output never triggers a second HTTP request (ADR-0008 §4, spec §9)", async () => {
    let requests = 0;
    const fetcher: JobPageFetcher = {
      fetchJobText: () => ((requests += 1), Promise.resolve({ text: postingText })),
    };
    const stores = fakeStores({ kind: "url", url: "https://jobs.example.com/1" });
    const { h, events, llm } = handlers({ "job-extract": { nonsense: true } }, stores, fetcher);
    const payload = { ...envelope, jobPostingId: IDS.posting, attempt: 1 };
    // 1 call + 2 regenerations inside the handler, then a permanent failure (no queue retry, no refetch).
    await expect(h["job.fetch"](payload, context())).rejects.toBeInstanceOf(PermanentJobError);
    expect(llm.calls.filter((c) => c.promptId === "job-extract")).toHaveLength(3);
    expect(requests).toBe(1);
    expect(events).toEqual(["job:fetched", "job:failed:ai"]);
    // Even if the queue retried the job (e.g. after a transient LLM error), the saved text is reused.
    await expect(h["job.fetch"](payload, context())).rejects.toBeInstanceOf(PermanentJobError);
    expect(requests).toBe(1);
  });

  it("recovers when a regeneration returns valid output", async () => {
    let requests = 0;
    const fetcher: JobPageFetcher = {
      fetchJobText: () => ((requests += 1), Promise.resolve({ text: postingText })),
    };
    const { h, events, llm } = handlers(
      {
        "job-extract": (_request, call) => (call === 0 ? { nonsense: true } : jobExtractionOutput),
      },
      fakeStores({ kind: "url", url: "https://jobs.example.com/1" }),
      fetcher,
    );
    await h["job.fetch"]({ ...envelope, jobPostingId: IDS.posting, attempt: 1 }, context());
    expect(events).toEqual(["job:fetched", "job:extracted"]);
    expect(llm.calls).toHaveLength(2);
    expect(requests).toBe(1);
  });

  it("a transient LLM error is retried by the queue without refetching", async () => {
    const { LlmError } = await import("@linkedin-ops/editorial-engine");
    let requests = 0;
    const fetcher: JobPageFetcher = {
      fetchJobText: () => ((requests += 1), Promise.resolve({ text: postingText })),
    };
    const { h } = handlers(
      {
        "job-extract": (_request, call) => {
          if (call === 0) throw new LlmError("UNAVAILABLE", { status: 503 });
          return jobExtractionOutput;
        },
      },
      fakeStores({ kind: "url", url: "https://jobs.example.com/1" }),
      fetcher,
    );
    const payload = { ...envelope, jobPostingId: IDS.posting, attempt: 1 };
    await expect(h["job.fetch"](payload, context())).rejects.toBeInstanceOf(RetryableJobError);
    await h["job.fetch"](payload, context({ retryCount: 1, isLastAttempt: true }));
    expect(requests).toBe(1);
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
    await h["job.fetch"]({ ...envelope, jobPostingId: IDS.posting, attempt: 1 }, context());
    expect(events).toEqual(["job:failed:not_a_job"]);
  });

  it("recognizes LinkedIn hosts only", () => {
    expect(isLinkedInUrl("https://www.linkedin.com/jobs/view/1")).toBe(true);
    expect(isLinkedInUrl("https://lnkd.in/abc")).toBe(true);
    expect(isLinkedInUrl("https://br.linkedin.com/jobs/view/1")).toBe(true);
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
    await h["cv.tailor"]({ ...envelope, jobPostingId: IDS.posting, attempt: 1 }, context());
    expect(events).toEqual(["job:tailored"]);
    expect(llm.calls.map((c) => c.promptId)).toEqual(["cv-tailor", "cv-humanize"]);
    const tailored = saved.tailored as {
      report: { baseScore: number; added: unknown[]; humanizer: unknown };
    };
    // mandatory met (1 × 0.7) + desirable missing (0 × 0.3) = 70; the added Kafka bullet does not count.
    expect(tailored.report.baseScore).toBe(70);
    expect(tailored.report.added).toHaveLength(1);
    expect(tailored.report.humanizer).toMatchObject({ passed: true, regenerations: 0 });
    // The D4 guard's lexicon is part of what produced the result (ADR-0005 §3).
    expect(saved.tailored).toMatchObject({
      generation: {
        promptVersions: {
          "cv-tailor": "1.0.0",
          "cv-humanize": "1.0.0",
          "cv-competency-lexicon": "1.0.1",
        },
      },
    });
  });

  it("regenerates the humanizer at most twice, then delivers and flags", async () => {
    const tellBullet = "Led the billing migration, passionate about durable queues.";
    const { h, saved, llm } = handlers({
      "cv-tailor": tailoringOutput(tellBullet),
      "cv-humanize": humanizeOutput({}, { ...segmentTexts, "seg-2": tellBullet }),
    });
    await h["cv.tailor"]({ ...envelope, jobPostingId: IDS.posting, attempt: 1 }, context());
    expect(llm.calls.filter((c) => c.promptId === "cv-humanize")).toHaveLength(3);
    const report = (saved.tailored as { report: { humanizer: Record<string, unknown> } }).report;
    expect(report.humanizer).toMatchObject({
      passed: false,
      regenerations: 2,
      failedRuleIds: ["cv.en.self-praise.passionate"],
    });
  });

  it("stops regenerating as soon as the checker passes", async () => {
    const tellBullet = "Led the billing migration, passionate about durable queues.";
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
    await h["cv.tailor"]({ ...envelope, jobPostingId: IDS.posting, attempt: 1 }, context());
    expect(llm.calls.filter((c) => c.promptId === "cv-humanize")).toHaveLength(2);
    const report = (saved.tailored as { report: { humanizer: Record<string, unknown> } }).report;
    expect(report.humanizer).toMatchObject({ passed: true, regenerations: 1 });
  });

  it("rejects an added number (D4 hard limit), regenerates twice, then fails `ai`", async () => {
    const output = tailoringOutput();
    const added = output.tailoredCv.experiences[0]?.bullets.segments[1];
    if (added) added.text = "Cut Kafka lag by 35%.";
    const { h, events, llm } = handlers({ "cv-tailor": output });
    // 1 call + 2 regenerations inside the handler, then a permanent `ai` failure (no queue retry).
    await expect(
      h["cv.tailor"]({ ...envelope, jobPostingId: IDS.posting, attempt: 1 }, context()),
    ).rejects.toBeInstanceOf(PermanentJobError);
    expect(llm.calls.filter((c) => c.promptId === "cv-tailor")).toHaveLength(3);
    expect(events).toEqual(["job:failed:ai"]);
  });

  it("regenerates when an invented entity is rejected, then delivers the clean output", async () => {
    const invented = tailoringOutput();
    const added = invented.tailoredCv.experiences[0]?.bullets.segments[1];
    if (added) added.text = "Delivered Project Apollo for Nubank using Kafka.";
    const { h, events, llm } = handlers({
      "cv-tailor": (_request, call) => (call === 0 ? invented : tailoringOutput()),
      "cv-humanize": humanizeOutput({}, segmentTexts),
    });
    await h["cv.tailor"]({ ...envelope, jobPostingId: IDS.posting, attempt: 1 }, context());
    expect(llm.calls.filter((c) => c.promptId === "cv-tailor")).toHaveLength(2);
    expect(events).toEqual(["job:tailored"]);
  });

  it("a cancellation on the LAST attempt never fails the posting (Crivo PR89-4)", async () => {
    const { LlmError } = await import("@linkedin-ops/editorial-engine");
    const { h, events } = handlers({
      "cv-tailor": () => {
        throw new LlmError("ABORTED");
      },
    });
    await expect(
      h["cv.tailor"](
        { ...envelope, jobPostingId: IDS.posting, attempt: 1 },
        context({ retryCount: 2, isLastAttempt: true }),
      ),
    ).rejects.toBeInstanceOf(CancelledJobError);
    expect(events).toEqual([]);
  });

  it("a job whose signal is aborted mid-fetch is cancelled, not failed, even on the last attempt", async () => {
    const controller = new AbortController();
    const fetcher: JobPageFetcher = {
      fetchJobText: () => {
        controller.abort();
        return Promise.reject(new JobFetchError("transient"));
      },
    };
    const { h, events } = handlers(
      {},
      fakeStores({ kind: "url", url: "https://jobs.example.com/1" }),
      fetcher,
    );
    await expect(
      h["job.fetch"](
        { ...envelope, jobPostingId: IDS.posting, attempt: 1 },
        context({ isLastAttempt: true, signal: controller.signal }),
      ),
    ).rejects.toBeInstanceOf(CancelledJobError);
    expect(events).toEqual([]);
  });

  it("treats auth/refusal LLM errors as permanent", async () => {
    const { LlmError } = await import("@linkedin-ops/editorial-engine");
    const { h, events } = handlers({
      "cv-tailor": () => {
        throw new LlmError("AUTH", { status: 401 });
      },
    });
    await expect(
      h["cv.tailor"]({ ...envelope, jobPostingId: IDS.posting, attempt: 1 }, context()),
    ).rejects.toBeInstanceOf(PermanentJobError);
    expect(events).toEqual(["job:failed:ai"]);
  });
});

describe("wireCareer", () => {
  const env = { openai: null, jobFetchLinkedIn: "disabled" as const };
  const llm = new SimulatedLlmClient({});

  it("wires only cv.extract until a JobPostingStore exists (career PR 3)", () => {
    const { cvStore, jobStore } = fakeStores();
    const onlyCv = wireCareer(env, pino({ level: "silent" }), { cvStore }, llm);
    expect(Object.keys(onlyCv ?? {})).toEqual(["cv.extract"]);
    const all = wireCareer(env, pino({ level: "silent" }), { cvStore, jobStore }, llm);
    expect(Object.keys(all ?? {}).sort()).toEqual(["cv.extract", "cv.tailor", "job.fetch"]);
  });

  it("is null without OpenAI credentials and no override", () => {
    expect(wireCareer(env, pino({ level: "silent" }), fakeStores())).toBeNull();
  });
});
