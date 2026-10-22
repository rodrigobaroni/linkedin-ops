// Fictional CV, posting and tailoring (spec §10: no real data of Rodrigo in the repository).
import type {
  CvStructured,
  JobPostingExtracted,
  MatchReport,
  TailoredCvContent,
} from "@linkedin-ops/contracts";

export function cvStructured(marker = "CANARIO-CV-0000"): CvStructured {
  return {
    language: "pt-BR",
    contact: {
      name: "Ana Exemplo",
      email: "ana@example.test",
      phone: null,
      location: "Curitiba, PR",
      links: [],
    },
    summary: { id: "summary", text: `Engenheira backend com oito anos em pagamentos. ${marker}` },
    experiences: [
      {
        id: "exp-1",
        company: "Empresa Fictícia S.A.",
        title: "Engenheira de software sênior",
        location: null,
        startDate: "2021-03",
        endDate: null,
        isCurrent: true,
        bullets: [{ id: "exp-1-b-1", text: "Liderei a migração da cobrança para filas duráveis." }],
        skills: [{ id: "exp-1-s-1", text: "PostgreSQL" }],
      },
    ],
    education: [],
    certifications: [],
    skills: { technical: [{ id: "skill-t-1", text: "TypeScript" }], behavioral: [] },
    languages: [],
    other: [],
  };
}

export function jobPostingExtracted(title = "Senior Backend Engineer"): JobPostingExtracted {
  return {
    language: "en",
    languageDetected: "en",
    title,
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
    ],
    keywords: ["TypeScript"],
  };
}

export function tailoredCvContent(marker = "CANARIO-TAILORED-0000"): TailoredCvContent {
  return {
    language: "en",
    summary: {
      segments: [
        {
          segmentId: "seg-1",
          text: `Backend engineer with eight years in payments. ${marker}`,
          provenance: "rewritten",
          sourceCvItemIds: ["summary"],
          targetRequirementIds: [],
          additionNote: null,
        },
      ],
    },
    experiences: [],
    skills: { technical: { segments: [] }, behavioral: { segments: [] } },
    educationIds: [],
    certificationIds: [],
    languageIds: [],
  };
}

export function matchReport(baseScore = 70): MatchReport {
  return {
    schemaVersion: "1.0",
    scoringVersion: "1.0.0",
    baseScore,
    jobLanguage: "en",
    cvLanguage: "en",
    requirements: [],
    added: [],
    humanizer: {
      rulesVersion: "cv-banned-phrases@1.0.0",
      passed: true,
      regenerations: 0,
      failedRuleIds: [],
      revertedSegmentIds: [],
    },
    warnings: [],
  };
}
