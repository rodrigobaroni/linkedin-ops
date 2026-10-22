// Fictional CV, posting and model outputs (spec §10: no real data of Rodrigo in the repository).
import type {
  CvExtractionOutput,
  CvSegment,
  CvStructured,
  CvTailoringOutput,
  JobExtractionOutput,
  JobPostingExtracted,
} from "@linkedin-ops/contracts";
import type { Rng } from "../../src/index.js";

export const fixedRng: Rng = { hex: (length) => "a".repeat(length) };

export const cvText = `Ana Exemplo
Engenheira backend com 8 anos em sistemas de pagamento.
Empresa Fictícia S.A. — Engenheira de software sênior (2021-03 a atual)
- Liderei a migração do serviço de cobrança para filas duráveis, reduzindo incidentes em 40%.
Competências: TypeScript, PostgreSQL. Comunicação.
Formação: Bacharelado em Ciência da Computação, Universidade Exemplo (2012-2016).
Idiomas: Inglês avançado.`;

export const cvExtractionOutput: CvExtractionOutput = {
  schemaVersion: "1.0",
  injectionSuspected: false,
  injectionEvidence: null,
  language: "pt-BR",
  contact: { name: "Ana Exemplo", email: null, phone: null, location: null, links: [] },
  summary: { id: "resumo", text: "Engenheira backend com 8 anos em sistemas de pagamento." },
  experiences: [
    {
      id: "exp-a",
      company: "Empresa Fictícia S.A.",
      title: "Engenheira de software sênior",
      location: null,
      startDate: "2021-03",
      endDate: null,
      isCurrent: true,
      bullets: [
        {
          id: "exp-a-1",
          text: "Liderei a migração do serviço de cobrança para filas duráveis, reduzindo incidentes em 40%.",
        },
      ],
      skills: [{ id: "skill-pg", text: "PostgreSQL" }],
    },
  ],
  education: [
    {
      id: "edu-a",
      institution: "Universidade Exemplo",
      degree: "Bacharelado",
      field: "Ciência da Computação",
      startDate: "2012",
      endDate: "2016",
    },
  ],
  certifications: [],
  skills: {
    technical: [{ id: "tech-1", text: "TypeScript" }],
    behavioral: [{ id: "beh-1", text: "Comunicação" }],
  },
  languages: [{ id: "lang-en", language: "Inglês", level: "avançado" }],
  other: [],
  parseWarnings: [],
};

/** `cvExtractionOutput` after id normalization. */
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
        {
          id: "exp-1-b-1",
          text: "Liderei a migração do serviço de cobrança para filas duráveis, reduzindo incidentes em 40%.",
        },
      ],
      skills: [{ id: "exp-1-s-1", text: "PostgreSQL" }],
    },
  ],
  education: [
    {
      id: "edu-1",
      institution: "Universidade Exemplo",
      degree: "Bacharelado",
      field: "Ciência da Computação",
      startDate: "2012",
      endDate: "2016",
    },
  ],
  certifications: [],
  skills: {
    technical: [{ id: "skill-t-1", text: "TypeScript" }],
    behavioral: [{ id: "skill-b-1", text: "Comunicação" }],
  },
  languages: [{ id: "lang-1", language: "Inglês", level: "avançado" }],
  other: [],
};

export const postingText = `Senior Backend Engineer at Fictional Corp (remote).
Requirements: 5+ years of TypeScript. Experience operating PostgreSQL in production.
Nice to have: Kafka is a plus.`;

export const jobExtractionOutput: JobExtractionOutput = {
  schemaVersion: "1.0",
  injectionSuspected: false,
  injectionEvidence: null,
  isJobPosting: true,
  notAJobReason: null,
  language: "en",
  languageDetected: "en",
  title: "Senior Backend Engineer",
  company: "Fictional Corp",
  location: null,
  workMode: "remote",
  seniority: "Senior",
  requirements: [
    {
      id: "req-1",
      kind: "mandatory",
      category: "technical",
      text: "5+ years with TypeScript",
      evidence: "5+ years of TypeScript",
    },
    {
      id: "req-2",
      kind: "mandatory",
      category: "technical",
      text: "PostgreSQL in production",
      evidence: "Experience operating PostgreSQL in production",
    },
    {
      id: "req-3",
      kind: "desirable",
      category: "technical",
      text: "Kafka",
      evidence: "Kafka is a plus",
    },
  ],
  keywords: ["TypeScript", "PostgreSQL", "Kafka"],
};

export const job: JobPostingExtracted = {
  language: "en",
  languageDetected: "en",
  title: "Senior Backend Engineer",
  company: "Fictional Corp",
  location: null,
  workMode: "remote",
  seniority: "Senior",
  requirements: jobExtractionOutput.requirements,
  keywords: ["TypeScript", "PostgreSQL", "Kafka"],
};

export const segment = (
  segmentId: string,
  text: string,
  provenance: CvSegment["provenance"],
  refs: string[],
  note: string | null = null,
): CvSegment =>
  provenance === "added"
    ? {
        segmentId,
        text,
        provenance,
        sourceCvItemIds: [],
        targetRequirementIds: refs,
        additionNote: note ?? "Aproxima a experiência do requisito.",
      }
    : {
        segmentId,
        text,
        provenance,
        sourceCvItemIds: refs,
        targetRequirementIds: [],
        additionNote: null,
      };

export function tailoringOutput(): CvTailoringOutput {
  return {
    schemaVersion: "1.0",
    targetLanguage: "en",
    injectionSuspected: false,
    injectionEvidence: null,
    matchAssessment: {
      requirements: [
        {
          requirementId: "req-1",
          status: "partial",
          cvEvidence: [{ cvItemId: "skill-t-1", quote: "TypeScript" }],
          rationale: "TypeScript aparece, mas sem anos declarados.",
        },
        {
          requirementId: "req-2",
          status: "met",
          cvEvidence: [{ cvItemId: "exp-1-s-1", quote: "PostgreSQL" }],
          rationale: "PostgreSQL listado na experiência atual.",
        },
        {
          requirementId: "req-3",
          status: "missing",
          cvEvidence: [],
          rationale: "Kafka não aparece no CV.",
        },
      ],
    },
    tailoredCv: {
      summary: {
        segments: [
          segment("seg-1", "Backend engineer with 8 years in payment systems.", "rewritten", [
            "summary",
          ]),
        ],
      },
      experiences: [
        {
          cvExperienceId: "exp-1",
          order: 1,
          bullets: {
            segments: [
              segment(
                "seg-2",
                "Led the migration of the billing service to durable queues, cutting incidents by 40%.",
                "rewritten",
                ["exp-1-b-1"],
              ),
              segment("seg-3", "Evaluated Kafka for event streaming.", "added", ["req-3"]),
            ],
          },
          skills: { segments: [segment("seg-4", "PostgreSQL", "original", ["exp-1-s-1"])] },
        },
      ],
      skills: {
        technical: { segments: [segment("seg-5", "TypeScript", "original", ["skill-t-1"])] },
        behavioral: { segments: [segment("seg-6", "Communication", "rewritten", ["skill-b-1"])] },
      },
      education: [{ cvEducationId: "edu-1", order: 1 }],
      certifications: [],
      languages: [{ cvLanguageId: "lang-1", order: 1 }],
    },
  };
}
