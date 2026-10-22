import type { CvStructured } from "@linkedin-ops/contracts";
import type { PrismaCvBases } from "./cv-bases.js";
import type {
  CareerFailureReason,
  CareerJobMeta,
  CvBaseDraftStore,
  CvExtractionResult,
} from "./ports.js";

/**
 * `CvBaseDraftStore` over the CV base repository (`cv_bases`, career PR 2). Every write is conditional on
 * the draft still being `EXTRACTING`, so a duplicated or late `cv.extract` changes nothing. Every detailed
 * failure reason maps to `EXTRACTION_FAILED` (the web offers a new upload either way); the reason itself goes
 * to the audit trail.
 */
export class PrismaCvBaseDraftStore implements CvBaseDraftStore {
  constructor(private readonly cvBases: PrismaCvBases<CvStructured>) {}

  async loadForExtraction(cvBaseId: string): Promise<{ text: string } | null> {
    const input = await this.cvBases.extractionInput(cvBaseId);
    return input === null ? null : { text: input.text };
  }

  async completeExtraction(
    cvBaseId: string,
    result: CvExtractionResult,
    meta: CareerJobMeta,
  ): Promise<void> {
    await this.cvBases.completeExtraction(
      cvBaseId,
      {
        content: result.cv,
        parseWarnings: result.parseWarnings,
        injectionSuspected: result.injectionSuspected,
        injectionEvidence: result.injectionEvidence,
        generation: result.generation,
      },
      workerMeta(meta),
    );
  }

  async markFailed(
    cvBaseId: string,
    reason: CareerFailureReason,
    meta: CareerJobMeta,
  ): Promise<void> {
    await this.cvBases.failExtraction(cvBaseId, "EXTRACTION_FAILED", workerMeta(meta), reason);
  }
}

function workerMeta(meta: CareerJobMeta) {
  return {
    correlationId: meta.correlationId,
    actor: { type: "WORKER" as const, jobId: meta.jobId },
  };
}
