import { Module } from "@nestjs/common";
import type { DynamicModule } from "@nestjs/common";
import { CvStructuredSchema } from "@linkedin-ops/contracts";
import {
  PrismaCvBases,
  PrismaJobPostings,
  type PrismaClient,
  type RuntimeEnv,
} from "@linkedin-ops/domain";
import type { Logger } from "pino";
import { RUNTIME_ENV } from "../config/runtime-env.module.js";
import { API_LOGGER } from "../logging/logger.js";
import { PRISMA_CLIENT, PrismaModule } from "../prisma/prisma.module.js";
import { CvBaseController } from "./cv-base.controller.js";
import {
  CAREER_RATE_LIMITS,
  CV_BASES,
  CvBaseService,
  DEFAULT_CAREER_RATE_LIMITS,
} from "./cv-base.service.js";
import { CV_EXTRACT_QUEUE, JOB_POSTING_QUEUE, PgBossCvExtractQueue } from "./cv-extract.queue.js";
import { CV_PDF_EXTRACTOR, CvPdfExtractor } from "./cv-pdf.extractor.js";
import {
  CV_SWEEP_OPTIONS,
  CvExtractionSweeper,
  DEFAULT_CV_SWEEP_OPTIONS,
} from "./cv-extraction.sweeper.js";
import { JobPostingController } from "./job-posting.controller.js";
import { JOB_POSTINGS, JobPostingService } from "./job-posting.service.js";
import { JobPostingSweeper } from "./job-posting.sweeper.js";

/** Career module (spec 2026-10-22): CV base (PR 2); batches and job postings (PR 3b). */
@Module({})
export class CareerModule {
  /** The root Pino logger is passed in (it is an `AppModule` provider, not a global one). */
  static forRoot(logger: Logger): DynamicModule {
    return {
      module: CareerModule,
      imports: [PrismaModule],
      controllers: [CvBaseController, JobPostingController],
      providers: [
        { provide: API_LOGGER, useValue: logger },
        {
          provide: CV_BASES,
          inject: [PRISMA_CLIENT],
          useFactory: (prisma: PrismaClient) =>
            new PrismaCvBases(prisma, (value) => CvStructuredSchema.parse(value)),
        },
        {
          provide: CV_EXTRACT_QUEUE,
          inject: [RUNTIME_ENV],
          useFactory: (env: RuntimeEnv) => new PgBossCvExtractQueue(env.databaseUrl, logger),
        },
        // One pg-boss producer for every career queue.
        { provide: JOB_POSTING_QUEUE, useExisting: CV_EXTRACT_QUEUE },
        {
          provide: JOB_POSTINGS,
          inject: [PRISMA_CLIENT],
          useFactory: (prisma: PrismaClient) => new PrismaJobPostings(prisma),
        },
        { provide: CAREER_RATE_LIMITS, useValue: DEFAULT_CAREER_RATE_LIMITS },
        { provide: CV_PDF_EXTRACTOR, useFactory: () => new CvPdfExtractor() },
        { provide: CV_SWEEP_OPTIONS, useValue: DEFAULT_CV_SWEEP_OPTIONS },
        CvBaseService,
        CvExtractionSweeper,
        JobPostingService,
        JobPostingSweeper,
      ],
    };
  }
}
