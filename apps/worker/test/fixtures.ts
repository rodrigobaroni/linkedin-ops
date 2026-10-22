// Fictional data only (spec §10).
import type { CvStructured, CvTailoringOutput, JobPostingExtracted } from "@linkedin-ops/contracts";

export const IDS = {
  cvBase: "018f6b1e-7c2a-7b3c-9d4e-000000000015",
  posting: "018f6b1e-7c2a-7b3c-9d4e-000000000016",
  user: "018f6b1e-7c2a-7b3c-9d4e-000000000001",
};

export const envelope = {
  schemaVersion: 1 as const,
  correlationId: "req_01JABCDEF",
  requestedBy: { type: "USER" as const, id: IDS.user },
};

export const cvText = "Ana Exemplo\nEngenheira backend com 8 anos em sistemas de pagamento.";

export const baseCv: CvStructured = {
  language: "pt-BR",
  contact: { name: "Ana Exemplo", email: null, phone: null, location: null, links: [] },
  summary: { id: "summary", text: "Engenheira backend com 8 anos em sistemas de pagamento." },
  experiences: [
    {
      id: "exp-1",
      company: "Empresa Fictícia S.A.",
      title: "Engenheira de software sênior",
      location: null,
      startDate: "2021-03",
      endDate: null,
      isCurrent: true,
      bullets: [
        { id: "exp-1-b-1", text: "Liderei a migração do serviço de cobrança para filas duráveis." },
      ],
      skills: [{ id: "exp-1-s-1", text: "PostgreSQL" }],
    },
  ],
  education: [],
  certifications: [],
  skills: { technical: [{ id: "skill-t-1", text: "TypeScript" }], behavioral: [] },
  languages: [],
  other: [],
};

export const cvExtractionOutput = {
  schemaVersion: "1.0",
  injectionSuspected: false,
  injectionEvidence: null,
  ...baseCv,
  parseWarnings: [],
};

export const postingText =
  "Senior Backend Engineer at Fictional Corp. Requirements: 5+ years of TypeScript. Kafka is a plus.";

export const job: JobPostingExtracted = {
  language: "en",
  languageDetected: "en",
  title: "Senior Backend Engineer",
  company: "Fictional Corp",
  location: null,
  workMode: null,
  seniority: null,
  requirements: [
    {
      id: "req-1",
      kind: "mandatory",
      category: "technical",
      text: "TypeScript",
      evidence: "5+ years of TypeScript",
    },
    {
      id: "req-2",
      kind: "desirable",
      category: "technical",
      text: "Kafka",
      evidence: "Kafka is a plus",
    },
  ],
  keywords: [],
};

export const jobExtractionOutput = {
  schemaVersion: "1.0",
  injectionSuspected: false,
  injectionEvidence: null,
  isJobPosting: true,
  notAJobReason: null,
  ...job,
};

export function tailoringOutput(
  bulletText = "Led the migration of the billing service to durable queues.",
): CvTailoringOutput {
  const base = { targetRequirementIds: [], additionNote: null };
  return {
    schemaVersion: "1.0",
    targetLanguage: "en",
    injectionSuspected: false,
    injectionEvidence: null,
    matchAssessment: {
      requirements: [
        {
          requirementId: "req-1",
          status: "met",
          cvEvidence: [{ cvItemId: "skill-t-1", quote: "TypeScript" }],
          rationale: "TypeScript nas competências.",
        },
        { requirementId: "req-2", status: "missing", cvEvidence: [], rationale: "Sem Kafka." },
      ],
    },
    tailoredCv: {
      summary: {
        segments: [
          {
            segmentId: "seg-1",
            text: "Backend engineer with 8 years in payments.",
            provenance: "rewritten",
            sourceCvItemIds: ["summary"],
            ...base,
          },
        ],
      },
      experiences: [
        {
          cvExperienceId: "exp-1",
          order: 1,
          bullets: {
            segments: [
              {
                segmentId: "seg-2",
                text: bulletText,
                provenance: "rewritten",
                sourceCvItemIds: ["exp-1-b-1"],
                ...base,
              },
              {
                segmentId: "seg-3",
                text: "Evaluated Kafka for event streaming.",
                provenance: "added",
                sourceCvItemIds: [],
                targetRequirementIds: ["req-2"],
                additionNote: "Aproxima do requisito de Kafka.",
              },
            ],
          },
          skills: { segments: [] },
        },
      ],
      skills: {
        technical: {
          segments: [
            {
              segmentId: "seg-4",
              text: "TypeScript",
              provenance: "original",
              sourceCvItemIds: ["skill-t-1"],
              ...base,
            },
          ],
        },
        behavioral: { segments: [] },
      },
      education: [],
      certifications: [],
      languages: [],
    },
  };
}

/** Humanizer output for the segment ids of `tailoringOutput()`, with optional rewrites. */
export function humanizeOutput(
  changes: Record<string, string> = {},
  texts: Record<string, string>,
) {
  return {
    schemaVersion: "1.0",
    injectionSuspected: false,
    injectionEvidence: null,
    segments: ["seg-1", "seg-2", "seg-3", "seg-4"].map((segmentId) => {
      const changed = changes[segmentId];
      return changed === undefined
        ? { segmentId, text: texts[segmentId] ?? "x", changed: false, changeReason: null }
        : { segmentId, text: changed, changed: true, changeReason: "Estilo." };
    }),
  };
}
