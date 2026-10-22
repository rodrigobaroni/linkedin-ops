import {
  CvStructuredSchema,
  JobPostingExtractedSchema,
  MatchReportSchema,
  TailoredCvContentSchema,
  type CvStructured,
  type JobPostingExtracted,
  type JobPostingFailure,
  type MatchReport,
  type TailoredCvContent,
} from "@linkedin-ops/contracts";
import type { PrismaClient } from "../client.js";
import type { Prisma } from "../generated/prisma/client.js";
import { newId } from "../ids.js";
import {
  audit,
  boundedText,
  JOB_POSTING_INJECTION_EVIDENCE_MAX_CHARS,
  type CareerAuditMeta,
  type CvTailorEnqueue,
} from "./job-postings.js";
import type {
  CareerFailureReason,
  GenerationInfo,
  JobPostingJobMeta,
  JobPostingSource,
  JobPostingStore,
} from "./ports.js";
import { sqlExecutor } from "./transaction.js";

/** Worker reasons → stored reason; `not_a_cv` belongs to `cv.extract` and never reaches a posting. */
const FAILURE_REASONS: Readonly<Record<CareerFailureReason, JobPostingFailure>> = {
  fetch: "FETCH",
  fetch_blocked: "FETCH_BLOCKED",
  not_a_job: "NOT_A_JOB",
  ai: "AI",
  not_a_cv: "AI",
};

/**
 * `JobPostingStore` over `job_postings`/`tailored_cvs` (career PR 3b), the worker side of
 * `PrismaJobPostings`. Every write is conditional on the posting still being in the status its step expects,
 * and on the cycle (`attempt`) of the job's payload, so a duplicated or late job, even one of an earlier cycle
 * that finds the posting back in the same status (ABA), changes nothing; every `load*` returns null otherwise
 * (ADR-0002 §8). The
 * extraction and the `cv.tailor` job commit together (`enqueueTailor` runs on the same transaction,
 * ADR-0002 §3). Audit actor `WORKER`; snapshots carry statuses, counts and versions, never posting or CV
 * content.
 */
export class PrismaJobPostingStore implements JobPostingStore {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly enqueueTailor: CvTailorEnqueue,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async loadForFetch(
    jobPostingId: string,
    meta: JobPostingJobMeta,
  ): Promise<{ source: JobPostingSource; fetchedText: string | null } | null> {
    const row = await this.prisma.jobPosting.findFirst({
      where: { id: jobPostingId, status: "FETCHING", attempt: meta.attempt },
      select: { url: true, source: true, pageText: true },
    });
    if (!row) return null;
    if (row.source === "PASTED") {
      // The CHECK guarantees the text of a pasted posting while it is `FETCHING`.
      return row.pageText === null
        ? null
        : { source: { kind: "pasted", text: row.pageText }, fetchedText: null };
    }
    return { source: { kind: "url", url: row.url }, fetchedText: row.pageText };
  }

  async saveFetchedText(
    jobPostingId: string,
    text: string,
    meta: JobPostingJobMeta,
  ): Promise<void> {
    const pageText = boundedText(text);
    if (pageText === null) return;
    const now = this.now();
    await this.prisma.jobPosting.updateMany({
      where: {
        id: jobPostingId,
        status: "FETCHING",
        attempt: meta.attempt,
        source: { not: "PASTED" },
      },
      data: { pageText, fetchedAt: now, updatedAt: now },
    });
  }

  async completeExtraction(
    jobPostingId: string,
    result: {
      job: JobPostingExtracted;
      rawText: string;
      droppedRequirementCount: number;
      injectionSuspected: boolean;
      injectionEvidence: string | null;
      generation: GenerationInfo;
    },
    meta: JobPostingJobMeta,
  ): Promise<void> {
    const job = JobPostingExtractedSchema.parse(result.job);
    const pageText = boundedText(result.rawText);
    const evidence = result.injectionSuspected
      ? Array.from(result.injectionEvidence ?? "")
          .slice(0, JOB_POSTING_INJECTION_EVIDENCE_MAX_CHARS)
          .join("") || null
      : null;
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.jobPosting.findUnique({
        where: { id: jobPostingId },
        select: { userId: true },
      });
      if (!row) return;
      const { count } = await tx.jobPosting.updateMany({
        where: { id: jobPostingId, status: "FETCHING", attempt: meta.attempt },
        data: {
          status: "ANALYZING",
          extracted: job as Prisma.InputJsonValue,
          ...(pageText === null ? {} : { pageText }),
          droppedRequirementCount: result.droppedRequirementCount,
          injectionSuspected: result.injectionSuspected,
          injectionEvidence: evidence,
          generation: { ...result.generation } as Prisma.InputJsonValue,
          updatedAt: this.now(),
        },
      });
      if (count === 0) return;
      await audit(
        tx,
        row.userId,
        workerMeta(meta),
        "job_posting.extracted",
        "job_posting",
        jobPostingId,
        {
          before: { status: "FETCHING" },
          after: {
            status: "ANALYZING",
            attempt: meta.attempt,
            requirements: job.requirements.length,
            droppedRequirements: result.droppedRequirementCount,
            injectionSuspected: String(result.injectionSuspected),
          },
        },
      );
      await this.enqueueTailor(sqlExecutor(tx), {
        jobPostingId,
        attempt: meta.attempt,
        correlationId: meta.correlationId,
      });
    });
  }

  async loadForTailoring(
    jobPostingId: string,
    meta: JobPostingJobMeta,
  ): Promise<{
    cvBaseId: string;
    base: CvStructured;
    job: JobPostingExtracted;
    rawText: string;
    jobInjectionSuspected: boolean;
  } | null> {
    const row = await this.prisma.jobPosting.findFirst({
      where: { id: jobPostingId, status: "ANALYZING", attempt: meta.attempt },
      select: { userId: true, extracted: true, pageText: true, injectionSuspected: true },
    });
    if (!row || row.extracted === null || row.pageText === null) return null;
    // The CV base active now (Maestro decision 3); `tailored_cvs.cv_base_id` records which one it was.
    const active = await this.prisma.cvBase.findFirst({
      where: { userId: row.userId, isActive: true },
      select: { id: true, content: true },
    });
    if (!active || active.content === null) return null;
    return {
      cvBaseId: active.id,
      base: CvStructuredSchema.parse(active.content),
      job: JobPostingExtractedSchema.parse(row.extracted),
      rawText: row.pageText,
      jobInjectionSuspected: row.injectionSuspected,
    };
  }

  async completeTailoring(
    jobPostingId: string,
    result: {
      cvBaseId: string;
      content: TailoredCvContent;
      report: MatchReport;
      generation: GenerationInfo;
    },
    meta: JobPostingJobMeta,
  ): Promise<void> {
    const content = TailoredCvContentSchema.parse(result.content);
    const report = MatchReportSchema.parse(result.report);
    const generation = { ...result.generation } as Prisma.InputJsonValue;
    const now = this.now();
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.jobPosting.findUnique({
        where: { id: jobPostingId },
        select: { userId: true },
      });
      if (!row) return;
      const { count } = await tx.jobPosting.updateMany({
        where: { id: jobPostingId, status: "ANALYZING", attempt: meta.attempt },
        data: { status: "READY", updatedAt: now },
      });
      if (count === 0) return;
      const previous = await tx.tailoredCv.findUnique({
        where: { jobPostingId },
        select: { cvBaseId: true, generation: true },
      });
      const data = {
        cvBaseId: result.cvBaseId,
        content: content as Prisma.InputJsonValue,
        matchReport: report as Prisma.InputJsonValue,
        generation,
        updatedAt: now,
      };
      await tx.tailoredCv.upsert({
        where: { jobPostingId },
        create: { id: newId(), userId: row.userId, jobPostingId, createdAt: now, ...data },
        update: data,
      });
      // Reprocessing replaces the tailored CV (no history in the MVP): the audit keeps what produced the
      // replaced one (model and versions), never its content (Maestro decision 2).
      await audit(
        tx,
        row.userId,
        workerMeta(meta),
        "job_posting.tailoring_ready",
        "job_posting",
        jobPostingId,
        {
          before:
            previous === null
              ? { status: "ANALYZING" }
              : { status: "ANALYZING", ...replacedSnapshot(previous) },
          after: {
            status: "READY",
            attempt: meta.attempt,
            cvBaseId: result.cvBaseId,
            baseScore: report.baseScore,
            added: report.added.length,
            ...generationSnapshot(result.generation),
          },
        },
      );
    });
  }

  async markFailed(
    jobPostingId: string,
    reason: CareerFailureReason,
    meta: JobPostingJobMeta,
  ): Promise<void> {
    const failureReason = FAILURE_REASONS[reason];
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.jobPosting.findFirst({
        where: {
          id: jobPostingId,
          status: { in: ["FETCHING", "ANALYZING"] },
          attempt: meta.attempt,
        },
        select: { userId: true, status: true },
      });
      if (!row) return;
      const { count } = await tx.jobPosting.updateMany({
        where: { id: jobPostingId, status: row.status, attempt: meta.attempt },
        data: { status: "FAILED", failureReason, updatedAt: this.now() },
      });
      if (count === 0) return;
      await audit(
        tx,
        row.userId,
        workerMeta(meta),
        "job_posting.failed",
        "job_posting",
        jobPostingId,
        {
          before: { status: row.status },
          after: { status: "FAILED", failureReason, cause: reason, attempt: meta.attempt },
        },
      );
    });
  }
}

function workerMeta(meta: JobPostingJobMeta): CareerAuditMeta {
  return { correlationId: meta.correlationId, actor: { type: "WORKER", jobId: meta.jobId } };
}

/** Flat audit fields of a `GenerationInfo` (`promptVersions` as `id@version`, sorted). */
function generationSnapshot(generation: GenerationInfo, prefix = ""): Record<string, string> {
  const key = (name: string) =>
    prefix === "" ? name : `${prefix}${name[0]?.toUpperCase()}${name.slice(1)}`;
  return {
    [key("model")]: generation.model,
    [key("engineVersion")]: generation.engineVersion,
    [key("promptVersions")]: Object.entries(generation.promptVersions)
      .map(([id, version]) => `${id}@${version}`)
      .sort()
      .join(","),
  };
}

function replacedSnapshot(previous: {
  cvBaseId: string;
  generation: Prisma.JsonValue;
}): Record<string, string> {
  const generation = previous.generation as Partial<GenerationInfo> | null;
  return {
    replacedCvBaseId: previous.cvBaseId,
    ...generationSnapshot(
      {
        model: typeof generation?.model === "string" ? generation.model : "unknown",
        engineVersion:
          typeof generation?.engineVersion === "string" ? generation.engineVersion : "unknown",
        promptVersions:
          generation?.promptVersions !== null && typeof generation?.promptVersions === "object"
            ? generation.promptVersions
            : {},
      },
      "replaced",
    ),
  };
}
