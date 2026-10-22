/**
 * Career job handlers (spec §5): `cv.extract`, `job.fetch` and `cv.tailor`. Plumbing over the ports of
 * `ports.ts`; all editorial logic lives in `@linkedin-ops/editorial-engine`. Logs carry ids, counts and
 * reasons only — never CV, posting or model text (spec §8).
 */
import {
  CAREER_PROMPTS,
  CV_COMPETENCY_LEXICON,
  CV_LINT_RULES_VERSION,
  ENGINE_VERSION,
  JOB_ECHO_REPEATED_RULE,
  buildCvExtractRequest,
  buildCvHumanizeRequest,
  buildCvTailorRequest,
  buildJobExtractRequest,
  buildMatchReport,
  lintTailoredCv,
  parseCvExtractResponse,
  parseCvHumanizeResponse,
  parseCvTailorResponse,
  parseJobExtractResponse,
  resolveTargetLanguage,
  sanitizeUntrustedText,
  JOB_TEXT_MAX_CHARS,
  type LlmClient,
  type Rng,
} from "@linkedin-ops/editorial-engine";
import { CancelledJobError, PermanentJobError, RetryableJobError } from "../jobs/errors.js";
import type { JobContext, JobHandler } from "../jobs/runner.js";
import { runLlmStep, runLlmStepWithRegenerations } from "./llm-step.js";
import {
  JobFetchError,
  type CareerFailureReason,
  type CvBaseDraftStore,
  type JobPageFetcher,
  type JobPostingStore,
} from "./ports.js";

/** Spec §5 step 5: the humanizer runs once and regenerates at most twice. */
export const HUMANIZE_MAX_ATTEMPTS = 3;
/** Spec §9: invalid `job-extract` output gets up to 2 new attempts inside the handler. */
export const JOB_EXTRACT_MAX_REGENERATIONS = 2;
/** Spec §9: invalid `cv-tailor` output (schema, provenance, D4 hard limits) gets up to 2 new attempts. */
export const CV_TAILOR_MAX_REGENERATIONS = 2;

export interface CareerHandlerDeps {
  llm: LlmClient;
  model: string;
  rng: Rng;
  cvStore: CvBaseDraftStore;
  jobStore: JobPostingStore;
  fetcher: JobPageFetcher;
  /** ADR-0008 kill switch (`JOB_FETCH_LINKEDIN`). */
  linkedInFetchEnabled: boolean;
}

export interface CareerHandlers {
  "cv.extract": JobHandler<"cv.extract">;
  "job.fetch": JobHandler<"job.fetch">;
  "cv.tailor": JobHandler<"cv.tailor">;
}

/**
 * Marks the item failed when this error ends the job for good, then rethrows for the runner. A cancellation
 * (shutdown, expiry) is never a failure of the item, not even on the last attempt (Crivo PR89-4).
 */
async function failIfFinal(
  error: unknown,
  context: JobContext,
  markFailed: (reason: CareerFailureReason) => Promise<void>,
  reason: CareerFailureReason,
): Promise<never> {
  if (error instanceof CancelledJobError || context.signal.aborted) throw new CancelledJobError();
  if (error instanceof PermanentJobError || context.isLastAttempt) await markFailed(reason);
  throw error;
}

export function isLinkedInUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "linkedin.com" || host.endsWith(".linkedin.com");
  } catch {
    return false;
  }
}

export function createCareerHandlers(deps: CareerHandlerDeps): CareerHandlers {
  const options = { model: deps.model, rng: deps.rng };
  // `versioned` = other versioned assets the step's result depends on, such as the lexicon of the D4 entity
  // guard (ADR-0005 §3: reproducibility).
  const generation = (
    model: string,
    prompts: (keyof typeof CAREER_PROMPTS)[],
    versioned: readonly { id: string; version: string }[] = [],
  ) => ({
    model,
    engineVersion: ENGINE_VERSION,
    promptVersions: Object.fromEntries([
      ...prompts.map((id) => [id, CAREER_PROMPTS[id].version]),
      ...versioned.map((asset) => [asset.id, asset.version]),
    ]),
  });

  const cvExtract: JobHandler<"cv.extract"> = async ({ cvBaseId }, context) => {
    const draft = await deps.cvStore.loadForExtraction(cvBaseId);
    if (!draft) {
      context.logger.info({ outcome: "skipped" }, "cv draft not awaiting extraction");
      return;
    }
    const markFailed = (reason: CareerFailureReason) => deps.cvStore.markFailed(cvBaseId, reason);
    try {
      const built = buildCvExtractRequest({ cvText: draft.text }, options);
      const { value, model } = await runLlmStep(
        deps.llm,
        built,
        parseCvExtractResponse,
        context.signal,
      );
      context.logger.info(
        {
          truncated: built.truncated,
          preflightFlags: built.preflightInjectionFlags,
          injectionSuspected: value.injectionSuspected,
          experiences: value.cv.experiences.length,
          parseWarnings: value.parseWarnings.length,
        },
        "cv extracted",
      );
      if (value.notACv) {
        await markFailed("not_a_cv");
        return;
      }
      await deps.cvStore.completeExtraction(cvBaseId, {
        cv: value.cv,
        parseWarnings: value.parseWarnings,
        injectionSuspected: value.injectionSuspected || built.preflightInjectionFlags.length > 0,
        injectionEvidence: value.injectionEvidence,
        generation: generation(model, ["cv-extract"]),
      });
    } catch (error) {
      await failIfFinal(error, context, markFailed, "ai");
    }
  };

  const jobFetch: JobHandler<"job.fetch"> = async ({ jobPostingId }, context) => {
    const posting = await deps.jobStore.loadForFetch(jobPostingId);
    if (!posting) {
      context.logger.info({ outcome: "skipped" }, "posting not awaiting fetch");
      return;
    }
    const markFailed = (reason: CareerFailureReason) =>
      deps.jobStore.markFailed(jobPostingId, reason);
    const { source } = posting;

    let text: string;
    if (source.kind === "pasted") {
      text = source.text;
    } else if (posting.fetchedText !== null) {
      // Saved by an earlier attempt: retrying the AI step never fetches the page again (ADR-0008 §4).
      text = posting.fetchedText;
      context.logger.info({ fetchOutcome: "reused" }, "job page text reused");
    } else if (isLinkedInUrl(source.url) && !deps.linkedInFetchEnabled) {
      context.logger.info(
        { outcome: "paste-text", reason: "kill-switch" },
        "linkedin fetch disabled",
      );
      await markFailed("fetch");
      return;
    } else {
      try {
        const fetched = (await deps.fetcher.fetchJobText(source.url, context.signal)).text;
        text = sanitizeUntrustedText(fetched, JOB_TEXT_MAX_CHARS).text;
      } catch (error) {
        const kind = error instanceof JobFetchError ? error.kind : "transient";
        context.logger.info({ fetchOutcome: kind }, "job page fetch failed");
        if (kind === "blocked") return markFailed("fetch_blocked");
        if (kind === "permanent") return markFailed("fetch");
        return failIfFinal(new RetryableJobError("fetch"), context, markFailed, "fetch");
      }
      await deps.jobStore.saveFetchedText(jobPostingId, text);
    }

    try {
      const sourceUrl = source.kind === "url" ? source.url : null;
      const { value, model, built } = await runLlmStepWithRegenerations(
        deps.llm,
        () => buildJobExtractRequest({ jobText: text, sourceUrl }, options),
        (raw) => parseJobExtractResponse(raw, { postingText: text }),
        context.signal,
        JOB_EXTRACT_MAX_REGENERATIONS,
        (attempt, reason) =>
          context.logger.warn(
            { extractAttempt: attempt, errorClass: reason },
            "job extract output invalid",
          ),
      );
      if (value.kind === "not_a_job") {
        await markFailed("not_a_job");
        return;
      }
      context.logger.info(
        {
          truncated: built.truncated,
          preflightFlags: built.preflightInjectionFlags,
          injectionSuspected: value.injectionSuspected,
          requirements: value.job.requirements.length,
          droppedRequirements: value.droppedRequirementCount,
          language: value.job.language,
        },
        "job extracted",
      );
      await deps.jobStore.completeExtraction(jobPostingId, {
        job: value.job,
        rawText: sanitizeUntrustedText(text, JOB_TEXT_MAX_CHARS).text,
        droppedRequirementCount: value.droppedRequirementCount,
        injectionSuspected: value.injectionSuspected || built.preflightInjectionFlags.length > 0,
        injectionEvidence: value.injectionEvidence,
        generation: generation(model, ["job-extract"]),
      });
    } catch (error) {
      await failIfFinal(error, context, markFailed, "ai");
    }
  };

  const cvTailor: JobHandler<"cv.tailor"> = async ({ jobPostingId }, context) => {
    const input = await deps.jobStore.loadForTailoring(jobPostingId);
    if (!input) {
      context.logger.info({ outcome: "skipped" }, "posting not awaiting tailoring");
      return;
    }
    const markFailed = (reason: CareerFailureReason) =>
      deps.jobStore.markFailed(jobPostingId, reason);
    try {
      const target = resolveTargetLanguage(input.job.language);
      const tailored = await runLlmStepWithRegenerations(
        deps.llm,
        () => buildCvTailorRequest({ base: input.base, job: input.job, target }, options),
        (raw) => parseCvTailorResponse(raw, { base: input.base, job: input.job, target }),
        context.signal,
        CV_TAILOR_MAX_REGENERATIONS,
        (attempt, reason) =>
          context.logger.warn(
            { tailorAttempt: attempt, errorClass: reason },
            "tailor output invalid",
          ),
      );
      const tailorBuilt = tailored.built;

      let cv = tailored.value.cv;
      let lint = lintTailoredCv(cv, { language: cv.language, jobText: input.rawText });
      const reverted = new Set<string>();
      let humanizeInjection = false;
      let attempts = 0;
      for (let attempt = 1; attempt <= HUMANIZE_MAX_ATTEMPTS; attempt += 1) {
        const built = buildCvHumanizeRequest({ cv, lintFindings: lint.findings, attempt }, options);
        const before = cv;
        try {
          const step = await runLlmStep(
            deps.llm,
            built,
            (raw) => parseCvHumanizeResponse(raw, { before, base: input.base }),
            context.signal,
          );
          attempts = attempt;
          cv = step.value.cv;
          step.value.revertedSegmentIds.forEach((id) => reverted.add(id));
          humanizeInjection ||= step.value.injectionSuspected;
        } catch (error) {
          // An unusable humanizer output keeps the previous text (spec §9: deliver and flag).
          if (error instanceof RetryableJobError && error.reason.startsWith("ai:")) {
            attempts = attempt;
            context.logger.warn(
              { humanizeAttempt: attempt, errorClass: error.reason },
              "humanize output discarded",
            );
            break;
          }
          throw error;
        }
        lint = lintTailoredCv(cv, { language: cv.language, jobText: input.rawText });
        if (lint.passed) break;
      }

      const report = buildMatchReport({
        job: input.job,
        requirements: tailored.value.requirements,
        cv,
        target,
        humanizer: {
          rulesVersion: CV_LINT_RULES_VERSION,
          passed: lint.passed,
          regenerations: Math.max(0, attempts - 1),
          failedRuleIds: lint.rejectRuleIds,
          revertedSegmentIds: [...reverted],
        },
        injectionSuspected:
          input.jobInjectionSuspected ||
          tailored.value.injectionSuspected ||
          tailorBuilt.preflightInjectionFlags.length > 0 ||
          humanizeInjection,
        jobEcho: lint.flagRuleIds.includes(JOB_ECHO_REPEATED_RULE),
      });
      context.logger.info(
        {
          baseScore: report.baseScore,
          added: report.added.length,
          evidenceRejected: report.requirements.filter((r) => r.evidenceRejected).length,
          promoted: tailored.value.promotedSegmentIds.length,
          humanizerPassed: report.humanizer.passed,
          regenerations: report.humanizer.regenerations,
          reverted: reverted.size,
          warnings: report.warnings,
        },
        "cv tailored",
      );
      await deps.jobStore.completeTailoring(jobPostingId, {
        cvBaseId: input.cvBaseId,
        content: cv,
        report,
        generation: generation(
          tailored.model,
          ["cv-tailor", "cv-humanize"],
          [CV_COMPETENCY_LEXICON],
        ),
      });
    } catch (error) {
      await failIfFinal(error, context, markFailed, "ai");
    }
  };

  return { "cv.extract": cvExtract, "job.fetch": jobFetch, "cv.tailor": cvTailor };
}
