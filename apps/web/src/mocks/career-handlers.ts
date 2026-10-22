import {
  API_V1_BASE_PATH,
  CV_UPLOAD_LIMITS,
  type CvBase,
  type CvBaseState,
  CvConfirmInputSchema,
  type CvDraft,
  type CvExtractionFailure,
  type CvStructured,
  type CvUploadAccepted,
  REQUESTED_WITH_HEADER,
} from "@linkedin-ops/contracts";
import { HttpResponse, delay, http } from "msw";
import { problemResponse, requireElevated, requireSession } from "./auth-handlers";

/**
 * Mock of `/career/cv` (career module PR 2; contract closed by Alicerce, spec
 * docs/superpowers/specs/2026-10-22-cv-tailoring-design.md) with the worker and the AI SIMULATED: the upload
 * answers `202 CvUploadAccepted` with an `EXTRACTING` draft, and the first `GET` after `extractionMs` settles
 * it — every readable PDF "extracts" to the fixed, fictitious CV below (no real data). It mirrors the server
 * rules the page relies on: multipart only with the N4 header, 5 MiB, PDF by signature (`%PDF-`), one draft
 * replaced by each upload, confirm of a replaced or unfinished draft → `409 CV_DRAFT_NOT_READY`, 🔐 delete.
 *
 * In `pnpm dev:mock` a file name decides the failure to simulate: `ilegivel` → `422 CV_PDF_UNREADABLE`,
 * `ia-fora` → `FAILED`/`EXTRACTION_FAILED`, `parado` → `FAILED`/`TIMED_OUT`, `lento` → 40 s of extraction.
 */
export const MOCK_CV_CONTENT: CvStructured = {
  language: "pt-BR",
  contact: {
    name: "Ana Exemplo",
    email: "ana@example.com",
    phone: "+55 11 90000-0000",
    location: "São Paulo, SP",
    links: ["https://example.com/ana"],
  },
  summary: {
    id: "summary",
    text: "Engenheira de software com 10 anos de experiência em produtos web e APIs. Texto fictício para testes.",
  },
  experiences: [
    {
      id: "exp-1",
      company: "Empresa Fictícia S.A.",
      title: "Engenheira de software sênior",
      location: "São Paulo, SP",
      startDate: "2021-03",
      endDate: null,
      isCurrent: true,
      bullets: [
        { id: "exp-1-b-1", text: "Liderou a migração de um monólito para serviços." },
        { id: "exp-1-b-2", text: "Mentorou quatro pessoas." },
      ],
      skills: [{ id: "exp-1-s-1", text: "PostgreSQL" }],
    },
    {
      id: "exp-2",
      company: "Startup Exemplo",
      title: "Desenvolvedora",
      location: "Remoto",
      startDate: "mar. 2016",
      endDate: "2021",
      isCurrent: false,
      bullets: [{ id: "exp-2-b-1", text: "Construiu o painel administrativo em React." }],
      skills: [],
    },
  ],
  education: [
    {
      id: "edu-1",
      institution: "Universidade Exemplo",
      degree: "Bacharelado",
      field: "Ciência da Computação",
      startDate: "2011",
      endDate: "2015",
    },
  ],
  certifications: [
    { id: "cert-1", name: "Certificação Fictícia de Nuvem", issuer: "Exemplo", date: "2022" },
  ],
  skills: {
    technical: [
      { id: "skill-t-1", text: "TypeScript" },
      { id: "skill-t-2", text: "React" },
    ],
    behavioral: [{ id: "skill-b-1", text: "Comunicação" }],
  },
  languages: [
    { id: "lang-1", language: "Português", level: "Nativo" },
    { id: "lang-2", language: "Inglês", level: "Avançado" },
  ],
  other: [{ id: "other-1", heading: "Voluntariado", text: "Monitora em oficinas de programação." }],
};

export type MockExtractionOutcome = "ok" | "unreadable" | "failed" | "timedOut" | "slow";

type MockCareerState = {
  active: CvBase | null;
  draft: CvDraft | null;
  /** Outcome of the next upload regardless of the file name (tests); `null` = decided by the name. */
  nextOutcome: MockExtractionOutcome | null;
  /** How long the simulated worker takes; tests settle it with `finishMockExtraction()`. */
  extractionMs: number;
  /** Pending extraction of `draft`: when and how it settles. */
  pending: { outcome: MockExtractionOutcome; readyAt: number } | null;
  uploads: number;
  /** `GET /career/cv` calls (polling assertions). */
  reads: number;
  /** Version of the next draft (versions are never reused, even after a delete). */
  nextVersion: number;
};

const state: MockCareerState = initialState();

function initialState(): MockCareerState {
  return {
    active: null,
    draft: null,
    nextOutcome: null,
    extractionMs: 3_000,
    pending: null,
    uploads: 0,
    reads: 0,
    nextVersion: 1,
  };
}

export function resetMockCareer(overrides: Partial<MockCareerState> = {}): void {
  Object.assign(state, initialState(), overrides);
}

export function mockCareerState(): Readonly<MockCareerState> {
  return state;
}

/** A confirmed CV base with the fixed content, for tests that start from the "confirmed" state. */
export function mockActiveCv(version = 1): CvBase {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    version,
    content: MOCK_CV_CONTENT,
    confirmedAt: now,
    createdAt: now,
  };
}

export function mockDraft(
  status: CvDraft["status"] = "READY",
  failureReason: CvExtractionFailure | null = status === "FAILED" ? "EXTRACTION_FAILED" : null,
): CvDraft {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    version: 1,
    status,
    failureReason,
    content: status === "READY" ? MOCK_CV_CONTENT : null,
    parseWarnings: [],
    injectionSuspected: false,
    createdAt: now,
    updatedAt: now,
  };
}

/** Makes the pending extraction settle on the next `GET /career/cv`. */
export function finishMockExtraction(): void {
  if (state.pending) state.pending.readyAt = 0;
}

/** The simulated worker: settles the pending extraction once its time has come. */
function settleExtraction(): void {
  const { draft, pending } = state;
  if (!draft || !pending || Date.now() < pending.readyAt) return;
  const updatedAt = new Date().toISOString();
  state.pending = null;
  if (pending.outcome === "failed" || pending.outcome === "timedOut") {
    const failureReason = pending.outcome === "failed" ? "EXTRACTION_FAILED" : "TIMED_OUT";
    state.draft = { ...draft, status: "FAILED", failureReason, updatedAt };
    return;
  }
  state.draft = { ...draft, status: "READY", content: MOCK_CV_CONTENT, updatedAt };
}

function url(path: string): string {
  return `${API_V1_BASE_PATH}${path}`;
}

function outcomeFor(fileName: string): MockExtractionOutcome {
  if (state.nextOutcome) return state.nextOutcome;
  const name = fileName.toLowerCase();
  if (name.includes("ilegivel")) return "unreadable";
  if (name.includes("ia-fora")) return "failed";
  if (name.includes("parado")) return "timedOut";
  if (name.includes("lento")) return "slow";
  return "ok";
}

async function hasPdfSignature(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  return String.fromCharCode(...head) === "%PDF-";
}

function cvState(): CvBaseState {
  return { active: state.active, draft: state.draft };
}

export const careerHandlers = [
  http.get(url("/career/cv"), ({ cookies }) => {
    const rejection = requireSession(cookies);
    if (rejection) return rejection;
    state.reads += 1;
    settleExtraction();
    return HttpResponse.json(cvState());
  }),

  http.post(url("/career/cv"), async ({ request, cookies }) => {
    const rejection = requireSession(cookies);
    if (rejection) return rejection;
    // N4 for the declared multipart exception: custom header + multipart body, nothing else.
    if (request.headers.get(REQUESTED_WITH_HEADER.name) !== REQUESTED_WITH_HEADER.value) {
      return problemResponse("CSRF_REJECTED");
    }
    if (!(request.headers.get("Content-Type") ?? "").startsWith("multipart/form-data")) {
      return problemResponse("UNSUPPORTED_MEDIA_TYPE");
    }
    const file = (await request.formData()).get(CV_UPLOAD_LIMITS.fieldName);
    if (!(file instanceof File) || file.size === 0) return problemResponse("VALIDATION_FAILED");
    if (file.size > CV_UPLOAD_LIMITS.maxBytes) return problemResponse("PAYLOAD_TOO_LARGE");
    if (!(await hasPdfSignature(file))) return problemResponse("UNSUPPORTED_MEDIA_TYPE");

    state.uploads += 1;
    const outcome = outcomeFor(file.name);
    // Realistic latency in the browser; `delay()` resolves at once in Node (Vitest).
    await delay();
    // Text extraction happens before answering: an unreadable PDF never becomes a draft.
    if (outcome === "unreadable") return problemResponse("CV_PDF_UNREADABLE");
    // A new upload replaces any previous draft (and its pending extraction).
    state.draft = { ...mockDraft("EXTRACTING"), version: state.nextVersion };
    state.nextVersion += 1;
    const extractionMs = outcome === "slow" ? 40_000 : state.extractionMs;
    state.pending = { outcome, readyAt: Date.now() + extractionMs };
    const accepted: CvUploadAccepted = {
      id: state.draft.id,
      status: state.draft.status,
      jobId: `mock-job-${state.uploads}`,
      draft: state.draft,
    };
    return HttpResponse.json(accepted, { status: 202 });
  }),

  http.post(url("/career/cv/confirm"), async ({ request, cookies }) => {
    const rejection = requireSession(cookies);
    if (rejection) return rejection;
    const parsed = CvConfirmInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return problemResponse("VALIDATION_FAILED");
    const { draft } = state;
    // Replaced by a newer upload (another tab) or not READY.
    if (!draft || draft.id !== parsed.data.draftId || draft.status !== "READY") {
      return problemResponse("CV_DRAFT_NOT_READY");
    }
    state.active = {
      id: crypto.randomUUID(),
      version: draft.version,
      content: parsed.data.content,
      confirmedAt: new Date().toISOString(),
      createdAt: draft.createdAt,
    };
    state.draft = null;
    return HttpResponse.json(state.active);
  }),

  http.delete(url("/career/cv"), ({ request, cookies }) => {
    const rejection = requireElevated(request, cookies);
    if (rejection) return rejection;
    state.active = null;
    state.draft = null;
    state.pending = null;
    return new HttpResponse(null, { status: 204 });
  }),
];
