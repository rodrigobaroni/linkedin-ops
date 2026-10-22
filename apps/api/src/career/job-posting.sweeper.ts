import { Inject, Injectable } from "@nestjs/common";
import type { OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import type { PrismaJobPostings } from "@linkedin-ops/domain";
import type { Logger } from "pino";
import { API_LOGGER } from "../logging/logger.js";
import { CV_SWEEP_OPTIONS, type CvSweepOptions } from "./cv-extraction.sweeper.js";
import { JOB_POSTINGS } from "./job-posting.service.js";

/**
 * Sentinela S-2 pattern for job postings (career PR 3b): a posting whose job was lost leaves
 * `FETCHING`/`ANALYZING` as `FAILED`/`TIMED_OUT`, and the page text of failed postings is erased after the
 * retention, whatever the reads. Same schedule as the CV sweep (`CV_SWEEP_OPTIONS`; `null` disables it): once
 * at boot, then every `intervalMs`. A failed sweep is logged (counts and error class only) and retried at the
 * next tick; it never blocks the boot.
 */
@Injectable()
export class JobPostingSweeper implements OnApplicationBootstrap, OnApplicationShutdown {
  #timer: NodeJS.Timeout | undefined;
  #running: Promise<{ timedOut: number; textErased: number }> | undefined;

  constructor(
    @Inject(JOB_POSTINGS) private readonly postings: PrismaJobPostings,
    @Inject(CV_SWEEP_OPTIONS) private readonly options: CvSweepOptions,
    @Inject(API_LOGGER) private readonly logger: Logger,
  ) {}

  onApplicationBootstrap(): void {
    if (this.options.intervalMs === null) return;
    void this.sweep();
    this.#timer = setInterval(() => void this.sweep(), this.options.intervalMs);
    this.#timer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    clearInterval(this.#timer);
    this.#timer = undefined;
    await this.#running?.catch(() => undefined);
  }

  /** One pass; overlapping calls share the pass in flight. */
  sweep(): Promise<{ timedOut: number; textErased: number }> {
    this.#running ??= this.postings
      .sweep()
      .then((result) => {
        if (result.timedOut > 0 || result.textErased > 0) {
          this.logger.info(result, "job posting sweep settled postings");
        }
        return result;
      })
      .catch((error: unknown) => {
        this.logger.warn(
          { errorName: error instanceof Error ? error.name : typeof error },
          "job posting sweep failed",
        );
        return { timedOut: 0, textErased: 0 };
      })
      .finally(() => {
        this.#running = undefined;
      });
    return this.#running;
  }
}
