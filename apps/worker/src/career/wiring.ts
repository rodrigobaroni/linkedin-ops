/** Builds the Career handlers from the validated environment and the domain stores wired so far. */
import { randomBytes } from "node:crypto";
import type { CvBaseDraftStore, JobPostingStore, WorkerRuntimeEnv } from "@linkedin-ops/domain";
import type { LlmClient, Rng } from "@linkedin-ops/editorial-engine";
import type { Logger } from "pino";
import { AnthropicLlmClient } from "../llm/anthropic.js";
import { OpenAiLlmClient, type LlmCallEvent } from "../llm/openai.js";
import { createCareerHandlers, type WiredCareerHandlers } from "./handlers.js";
import { unavailableJobPageFetcher, type JobPageFetcher } from "./ports.js";

export const cryptoRng: Rng = {
  hex: (length) =>
    randomBytes(Math.ceil(length / 2))
      .toString("hex")
      .slice(0, length),
};

export interface CareerStores {
  cvStore: CvBaseDraftStore;
  /** Job postings (career PR 3b). Without it `job.fetch` and `cv.tailor` are provisioned but not consumed. */
  jobStore?: JobPostingStore;
  fetcher?: JobPageFetcher;
}

/** Never called: the postings handlers are not registered until a real `JobPostingStore` is passed. */
const unwiredJobStore: JobPostingStore = {
  loadForFetch: unwired,
  saveFetchedText: unwired,
  completeExtraction: unwired,
  loadForTailoring: unwired,
  completeTailoring: unwired,
  markFailed: unwired,
};

function unwired(): Promise<never> {
  return Promise.reject(new Error("JobPostingStore is not wired (career PR 3)"));
}

/**
 * `null` when no LLM provider is configured (allowed outside production only; `validateWorkerEnv` makes one
 * mandatory for the worker in production). Claude is preferred when both are set (ADR-0011).
 */
export function wireCareer(
  env: Pick<WorkerRuntimeEnv, "openai" | "jobFetchLinkedIn"> &
    Partial<Pick<WorkerRuntimeEnv, "anthropic">>,
  logger: Logger,
  stores: CareerStores,
  llmOverride?: LlmClient,
): WiredCareerHandlers | null {
  const anthropic = env.anthropic ?? null;
  if (anthropic === null && env.openai === null && llmOverride === undefined) return null;
  const onEvent = (event: LlmCallEvent) => logger.info({ llm: event }, "llm call");
  const llm =
    llmOverride ??
    (anthropic !== null
      ? new AnthropicLlmClient({ apiKey: anthropic.apiKey, onEvent })
      : new OpenAiLlmClient({ apiKey: env.openai?.apiKey ?? "", onEvent }));
  const handlers = createCareerHandlers({
    llm,
    model: anthropic?.model ?? env.openai?.model ?? "simulated",
    rng: cryptoRng,
    cvStore: stores.cvStore,
    jobStore: stores.jobStore ?? unwiredJobStore,
    fetcher: stores.fetcher ?? unavailableJobPageFetcher,
    linkedInFetchEnabled: env.jobFetchLinkedIn === "enabled",
  });
  return stores.jobStore === undefined ? { "cv.extract": handlers["cv.extract"] } : handlers;
}
