import { Module } from "@nestjs/common";
import type { DynamicModule } from "@nestjs/common";
import { CvStructuredSchema } from "@linkedin-ops/contracts";
import { PrismaCvBases, type PrismaClient } from "@linkedin-ops/domain";
import type { Logger } from "pino";
import { API_LOGGER } from "../logging/logger.js";
import { PRISMA_CLIENT, PrismaModule } from "../prisma/prisma.module.js";
import { CvBaseController } from "./cv-base.controller.js";
import {
  CAREER_RATE_LIMITS,
  CV_BASES,
  CvBaseService,
  DEFAULT_CAREER_RATE_LIMITS,
} from "./cv-base.service.js";
import { CV_EXTRACT_QUEUE, UnwiredCvExtractQueue } from "./cv-extract.queue.js";
import { CV_PDF_EXTRACTOR, CvPdfExtractor } from "./cv-pdf.extractor.js";
import {
  CV_SWEEP_OPTIONS,
  CvExtractionSweeper,
  DEFAULT_CV_SWEEP_OPTIONS,
} from "./cv-extraction.sweeper.js";

/** Career module (spec 2026-10-22): CV base in PR 2; job postings and tailoring arrive in PR 3. */
@Module({})
export class CareerModule {
  /** The root Pino logger is passed in (it is an `AppModule` provider, not a global one). */
  static forRoot(logger: Logger): DynamicModule {
    return {
      module: CareerModule,
      imports: [PrismaModule],
      controllers: [CvBaseController],
      providers: [
        { provide: API_LOGGER, useValue: logger },
        {
          provide: CV_BASES,
          inject: [PRISMA_CLIENT],
          useFactory: (prisma: PrismaClient) =>
            new PrismaCvBases(prisma, (value) => CvStructuredSchema.parse(value)),
        },
        { provide: CV_EXTRACT_QUEUE, useClass: UnwiredCvExtractQueue },
        { provide: CAREER_RATE_LIMITS, useValue: DEFAULT_CAREER_RATE_LIMITS },
        { provide: CV_PDF_EXTRACTOR, useFactory: () => new CvPdfExtractor() },
        { provide: CV_SWEEP_OPTIONS, useValue: DEFAULT_CV_SWEEP_OPTIONS },
        CvBaseService,
        CvExtractionSweeper,
      ],
    };
  }
}
