import { Inject, Injectable } from "@nestjs/common";
import type { OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import type { CvStructured } from "@linkedin-ops/contracts";
import type { PrismaCvBases } from "@linkedin-ops/domain";
import type { Logger } from "pino";
import { API_LOGGER } from "../logging/logger.js";
import { CV_BASES } from "./cv-base.service.js";

export const CV_SWEEP_OPTIONS = Symbol("CV_SWEEP_OPTIONS");

export interface CvSweepOptions {
  /** Period of the sweep; `null` disables it entirely (suites without a database). */
  intervalMs: number | null;
}

export const DEFAULT_CV_SWEEP_OPTIONS: Readonly<CvSweepOptions> = { intervalMs: 5 * 60 * 1000 };

/**
 * Sentinela S-2 (PR #88): the PDF text of a draft whose `cv.extract` job was lost must not wait for the
 * owner to open "Meu CV". This sweep settles stale `EXTRACTING` drafts (`FAILED`/`TIMED_OUT`, text erased)
 * once at boot and then every `intervalMs`, whatever the reads. A failed sweep is logged (no content) and
 * retried at the next tick; it never blocks the boot.
 */
@Injectable()
export class CvExtractionSweeper implements OnApplicationBootstrap, OnApplicationShutdown {
  #timer: NodeJS.Timeout | undefined;
  #running: Promise<number> | undefined;

  constructor(
    @Inject(CV_BASES) private readonly cvBases: PrismaCvBases<CvStructured>,
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
    await this.#running?.catch(() => 0);
  }

  /** One pass; overlapping calls share the pass in flight. Resolves with the number of drafts settled. */
  sweep(): Promise<number> {
    this.#running ??= this.cvBases
      .settleStaleExtractions()
      .then((settled) => {
        if (settled > 0) this.logger.info({ settled }, "cv extraction sweep settled stale drafts");
        return settled;
      })
      .catch((error: unknown) => {
        this.logger.warn(
          { errorName: error instanceof Error ? error.name : typeof error },
          "cv extraction sweep failed",
        );
        return 0;
      })
      .finally(() => {
        this.#running = undefined;
      });
    return this.#running;
  }
}
