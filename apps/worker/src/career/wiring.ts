/** Builds the Career handlers from the validated environment once the stores exist (PR 2/3 pass them in). */
import { randomBytes } from "node:crypto";
import type { WorkerRuntimeEnv } from "@linkedin-ops/domain";
import type { LlmClient, Rng } from "@linkedin-ops/editorial-engine";
import type { Logger } from "pino";
import { OpenAiLlmClient } from "../llm/openai.js";
import { createCareerHandlers, type CareerHandlers } from "./handlers.js";
import {
  unavailableJobPageFetcher,
  type CvBaseDraftStore,
  type JobPageFetcher,
  type JobPostingStore,
} from "./ports.js";

export const cryptoRng: Rng = {
  hex: (length) =>
    randomBytes(Math.ceil(length / 2))
      .toString("hex")
      .slice(0, length),
};

export interface CareerStores {
  cvStore: CvBaseDraftStore;
  jobStore: JobPostingStore;
  fetcher?: JobPageFetcher;
}

/**
 * `null` when the stores are not wired yet or OpenAI is not configured (allowed outside production only;
 * `validateWorkerEnv` makes it mandatory for the worker in production).
 */
export function wireCareer(
  env: Pick<WorkerRuntimeEnv, "openai" | "jobFetchLinkedIn">,
  logger: Logger,
  stores: CareerStores | null,
  llmOverride?: LlmClient,
): CareerHandlers | null {
  if (stores === null || (env.openai === null && llmOverride === undefined)) return null;
  const llm =
    llmOverride ??
    new OpenAiLlmClient({
      apiKey: env.openai?.apiKey ?? "",
      onEvent: (event) => logger.info({ llm: event }, "llm call"),
    });
  return createCareerHandlers({
    llm,
    model: env.openai?.model ?? "simulated",
    rng: cryptoRng,
    cvStore: stores.cvStore,
    jobStore: stores.jobStore,
    fetcher: stores.fetcher ?? unavailableJobPageFetcher,
    linkedInFetchEnabled: env.jobFetchLinkedIn === "enabled",
  });
}
