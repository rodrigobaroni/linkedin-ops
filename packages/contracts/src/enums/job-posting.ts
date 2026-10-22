import { z } from "zod";

/**
 * Lifecycle of a job posting (career module, spec 2026-10-22 §3 and §5): `FETCHING` (buscando) while
 * `job.fetch` reads the page and extracts the posting, `ANALYZING` (analisando) while `cv.tailor` runs,
 * then `READY` (pronto) or `FAILED` (falhou, with a reason).
 */
export const JobPostingStatusSchema = z
  .enum(["FETCHING", "ANALYZING", "READY", "FAILED"])
  .meta({ id: "JobPostingStatus" });
export const JobPostingStatus = JobPostingStatusSchema.enum;
export type JobPostingStatus = z.infer<typeof JobPostingStatusSchema>;

/**
 * Why a posting is `FAILED` (spec §9, ADR-0008 §4): the page did not open (`FETCH`), the site signalled a
 * block (`FETCH_BLOCKED`), the page is not a job posting (`NOT_A_JOB`), the model output stayed invalid
 * (`AI`) or the job was lost by the queue (`TIMED_OUT`). Every reason offers pasting the text.
 */
export const JobPostingFailureSchema = z
  .enum(["FETCH", "FETCH_BLOCKED", "NOT_A_JOB", "AI", "TIMED_OUT"])
  .meta({ id: "JobPostingFailure" });
export const JobPostingFailure = JobPostingFailureSchema.enum;
export type JobPostingFailure = z.infer<typeof JobPostingFailureSchema>;

/** Where the posting text comes from: a LinkedIn page, another site, or text pasted by the owner. */
export const JobPostingSourceKindSchema = z
  .enum(["LINKEDIN", "OTHER", "PASTED"])
  .meta({ id: "JobPostingSourceKind" });
export const JobPostingSourceKind = JobPostingSourceKindSchema.enum;
export type JobPostingSourceKind = z.infer<typeof JobPostingSourceKindSchema>;

/**
 * Why a `FETCH_BLOCKED` posting was blocked (issue #112): the LinkedIn fetch is switched off (`DISABLED`), the
 * domain's daily quota is used up (`QUOTA`) or the domain's circuit breaker is open after a stop signal
 * (`BREAKER`). The web says which, and when to try again.
 */
export const JobPostingBlockedKindSchema = z
  .enum(["DISABLED", "QUOTA", "BREAKER"])
  .meta({ id: "JobPostingBlockedKind" });
export const JobPostingBlockedKind = JobPostingBlockedKindSchema.enum;
export type JobPostingBlockedKind = z.infer<typeof JobPostingBlockedKindSchema>;
