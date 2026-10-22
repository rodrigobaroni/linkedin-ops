import {
  CV_UPLOAD_LIMITS,
  type CvBase,
  type CvBaseState,
  type CvConfirmInput,
  type CvUploadAccepted,
  routesV1,
} from "@linkedin-ops/contracts";
import type { ApiClient } from "./http";

export type {
  CvBase,
  CvBaseState,
  CvConfirmInput,
  CvDraft,
  CvDraftStatus,
  CvExtractionFailure,
  CvUploadAccepted,
} from "@linkedin-ops/contracts";
export { CV_UPLOAD_LIMITS };

const routes = {
  get: routesV1["career.cv.get"],
  upload: routesV1["career.cv.upload"],
  confirm: routesV1["career.cv.confirm"],
  remove: routesV1["career.cv.delete"],
};

export const CAREER_CV_QUERY_KEY = ["career", "cv"] as const;

/** Polling of `GET /career/cv` while the draft is `EXTRACTING`: 2 s, growing ×1.5 per poll up to 10 s. */
export const CV_POLL = { initialMs: 2_000, factor: 1.5, maxMs: 10_000 } as const;

/** Delay before poll number `attempt` (0-based) of the same extraction. */
export function cvPollDelayMs(attempt: number, initialMs: number = CV_POLL.initialMs): number {
  return Math.min(initialMs * CV_POLL.factor ** attempt, CV_POLL.maxMs);
}

/** Why a picked file is refused before upload. The API checks again (signature, size); this is only UX. */
export type CvFileProblem = "empty" | "tooLarge" | "notPdf";

export function checkCvFile(file: File): CvFileProblem | null {
  if (file.size === 0) return "empty";
  if (file.size > CV_UPLOAD_LIMITS.maxBytes) return "tooLarge";
  const pdfType = file.type === CV_UPLOAD_LIMITS.mimeType;
  const pdfName = file.name.toLowerCase().endsWith(".pdf");
  // Some systems leave `type` empty: the extension is enough here, the API reads the signature.
  if (!pdfType && !(file.type === "" && pdfName)) return "notPdf";
  return null;
}

export function createCareerCvApi(client: ApiClient) {
  return {
    /** `GET /career/cv`: `{ active, draft }`. */
    get: (signal?: AbortSignal): Promise<CvBaseState> => client.request(routes.get, { signal }),
    /** `POST /career/cv` (multipart, 202): stores the PDF text and returns the `EXTRACTING` draft. */
    upload: (file: File): Promise<CvUploadAccepted> => {
      const formData = new FormData();
      formData.append(CV_UPLOAD_LIMITS.fieldName, file);
      return client.request(routes.upload, { formData });
    },
    /** `POST /career/cv/confirm`: the reviewed draft becomes the active CV base. */
    confirm: (input: CvConfirmInput): Promise<CvBase> =>
      client.request(routes.confirm, { body: input }),
    /** `DELETE /career/cv` (🔐): CV base, draft and dependents. */
    remove: (): Promise<void> => client.request(routes.remove),
  };
}
export type CareerCvApi = ReturnType<typeof createCareerCvApi>;
