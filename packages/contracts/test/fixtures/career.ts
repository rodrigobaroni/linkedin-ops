// Fictional CV and job posting (spec §10: no real data of Rodrigo in the repository).
import {
  CvExtractionOutputSchema,
  CvHumanizationOutputSchema,
  CvStructuredSchema,
  CvTailoringOutputSchema,
  JobExtractionOutputSchema,
  JobPostingExtractedSchema,
  MatchReportSchema,
  TailoredCvContentSchema,
  type CvExtractionOutput,
  type CvHumanizationOutput,
  type CvStructured,
  type CvTailoringOutput,
  type JobExtractionOutput,
  type JobPostingExtracted,
  type MatchReport,
  type TailoredCvContent,
} from "../../src/index.js";
import { drop, repeat, set, type SchemaCase } from "../helpers.js";

export const cvStructured: CvStructured = {
  language: "pt-BR",
  contact: {
    fullName: "Ana Exemplo",
    headline: "Engenheira de software backend",
    email: "ana@example.com",
    phone: null,
    location: "Curitiba, PR",
    links: ["https://example.com/ana"],
  },
  summary: "Engenheira backend com oito anos em sistemas de pagamento.",
  experiences: [
    {
      id: "exp-1",
      company: "Empresa Fictícia S.A.",
      title: "Engenheira de software sênior",
      location: "Remoto",
      startDate: "2021-03",
      endDate: null,
      current: true,
      description: null,
      bullets: ["Liderei a migração do serviço de cobrança para filas duráveis."],
    },
    {
      id: "exp-2",
      company: "Startup Imaginária",
      title: "Desenvolvedora backend",
      location: null,
      startDate: "2017",
      endDate: "2021-02",
      current: false,
      description: "Time de plataforma.",
      bullets: [],
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
  skills: [
    { id: "skill-1", name: "TypeScript", category: "technical" },
    { id: "skill-2", name: "Comunicação", category: "behavioral" },
  ],
  languages: [{ id: "lang-1", language: "Inglês", proficiency: "avançado" }],
  certifications: [],
};

export const cvExtractionOutput: CvExtractionOutput = {
  schemaVersion: "1.0",
  cv: cvStructured,
  warnings: [],
  injectionSuspected: false,
  injectionEvidence: null,
};

export const jobPostingExtracted: JobPostingExtracted = {
  title: "Senior Backend Engineer",
  company: "Fictional Corp",
  location: "Remote (LATAM)",
  workModel: "remote",
  seniority: "senior",
  language: "en",
  summary: "Own the billing platform.",
  requirements: [
    { id: "req-1", text: "5+ years with TypeScript", kind: "required", category: "technical" },
    { id: "req-2", text: "Experience with Kafka", kind: "preferred", category: "technical" },
  ],
};

export const jobExtractionOutput: JobExtractionOutput = {
  schemaVersion: "1.0",
  isJobPosting: true,
  job: jobPostingExtracted,
  injectionSuspected: false,
  injectionEvidence: null,
};

export const tailoredCvContent: TailoredCvContent = {
  language: "en",
  headline: { text: "Senior backend engineer", provenance: "rewritten", sourceRefs: ["summary"] },
  summary: {
    text: "Backend engineer with eight years in payment systems.",
    provenance: "rewritten",
    sourceRefs: ["summary"],
  },
  experiences: [
    {
      baseId: "exp-1",
      title: { text: "Senior software engineer", provenance: "rewritten", sourceRefs: ["exp-1"] },
      bullets: [
        {
          text: "Led the migration of the billing service to durable queues.",
          provenance: "rewritten",
          sourceRefs: ["exp-1"],
        },
        {
          text: "Evaluated Kafka for event streaming.",
          provenance: "added",
          sourceRefs: ["req-2"],
        },
      ],
    },
  ],
  education: [
    {
      baseId: "edu-1",
      degree: { text: "Bachelor's degree", provenance: "rewritten", sourceRefs: ["edu-1"] },
      field: null,
    },
  ],
  skills: [{ text: "TypeScript", provenance: "original", sourceRefs: ["skill-1"] }],
  languages: [{ text: "English (advanced)", provenance: "rewritten", sourceRefs: ["lang-1"] }],
  certifications: [],
};

export const cvTailoringOutput: CvTailoringOutput = {
  schemaVersion: "1.0",
  coverage: [
    {
      requirementId: "req-1",
      status: "met",
      evidence: [{ ref: "skill-1", quote: "TypeScript" }],
    },
    { requirementId: "req-2", status: "missing", evidence: [] },
  ],
  cv: tailoredCvContent,
  injectionSuspected: false,
  injectionEvidence: null,
};

export const cvHumanizationOutput: CvHumanizationOutput = {
  schemaVersion: "1.0",
  cv: tailoredCvContent,
  changes: [
    {
      ruleId: "cv.buzzword",
      before: "Spearheaded the migration",
      after: "Led the migration",
    },
  ],
  factsChanged: false,
  injectionSuspected: false,
  injectionEvidence: null,
};

export const matchReport: MatchReport = {
  schemaVersion: "1.0",
  scoringVersion: "1",
  baseScore: 67,
  requirements: [
    {
      requirementId: "req-1",
      text: "5+ years with TypeScript",
      kind: "required",
      category: "technical",
      status: "met",
      evidence: [{ ref: "skill-1", quote: "TypeScript" }],
    },
    {
      requirementId: "req-2",
      text: "Experience with Kafka",
      kind: "preferred",
      category: "technical",
      status: "missing",
      evidence: [],
    },
  ],
  added: [
    {
      section: "experience",
      baseId: "exp-1",
      text: "Evaluated Kafka for event streaming.",
      requirementIds: ["req-2"],
    },
  ],
  humanizer: { passed: true, regenerations: 0, failedRuleIds: [], rulesVersion: "1.0.0" },
  injectionSuspected: false,
};

export const careerCases: SchemaCase[] = [
  {
    name: "CvStructured",
    schema: CvStructuredSchema,
    valid: cvStructured,
    invalid: {
      "duplicate item id": set("skills.1.id", "exp-1"),
      "reserved summary id": set("skills.0.id", "summary"),
      "malformed date": set("experiences.0.startDate", "03/2021"),
      "unknown key (strict)": set("contact.photo", "x"),
      "missing summary": drop("summary"),
      "bad language tag": set("language", "portuguese"),
      "name too long": set("contact.fullName", repeat("a", 201)),
    },
  },
  {
    name: "CvExtractionOutput",
    schema: CvExtractionOutputSchema,
    valid: cvExtractionOutput,
    invalid: {
      "wrong schemaVersion": set("schemaVersion", "2.0"),
      "missing injectionEvidence": drop("injectionEvidence"),
    },
  },
  {
    name: "JobPostingExtracted",
    schema: JobPostingExtractedSchema,
    valid: jobPostingExtracted,
    invalid: {
      "no requirements": set("requirements", []),
      "duplicate requirement id": set("requirements.1.id", "req-1"),
      "unknown kind": set("requirements.0.kind", "nice"),
      "unknown seniority": set("seniority", "ninja"),
    },
  },
  {
    name: "JobExtractionOutput",
    schema: JobExtractionOutputSchema,
    valid: jobExtractionOutput,
    invalid: {
      "not a job but job present": set("isJobPosting", false),
      "job but no posting": set("job", null),
    },
  },
  {
    name: "TailoredCvContent",
    schema: TailoredCvContentSchema,
    valid: tailoredCvContent,
    invalid: {
      "segment without sourceRefs": set("summary.sourceRefs", []),
      "too many sourceRefs": set("experiences.0.bullets.0.sourceRefs", [
        "exp-1",
        "exp-2",
        "skill-1",
        "skill-2",
        "lang-1",
        "edu-1",
      ]),
      "added language": set("languages.0.provenance", "added"),
      "added experience title": set("experiences.0.title", {
        text: "Staff engineer",
        provenance: "added",
        sourceRefs: ["req-2"],
      }),
      "added education degree": set("education.0.degree", {
        text: "PhD",
        provenance: "added",
        sourceRefs: ["req-2"],
      }),
      "duplicate experience baseId": set("experiences", [
        tailoredCvContent.experiences[0],
        tailoredCvContent.experiences[0],
      ]),
      "unknown provenance": set("skills.0.provenance", "inferred"),
    },
  },
  {
    name: "CvTailoringOutput",
    schema: CvTailoringOutputSchema,
    valid: cvTailoringOutput,
    invalid: {
      "met without evidence": set("coverage.0.evidence", []),
      "missing with evidence": set("coverage.1.evidence", [
        { ref: "skill-1", quote: "TypeScript" },
      ]),
      "duplicate coverage": set("coverage.1.requirementId", "req-1"),
      "model returns a score (strict)": set("baseScore", 80),
    },
  },
  {
    name: "CvHumanizationOutput",
    schema: CvHumanizationOutputSchema,
    valid: cvHumanizationOutput,
    invalid: {
      "facts changed": set("factsChanged", true),
      "missing changes": drop("changes"),
    },
  },
  {
    name: "MatchReport",
    schema: MatchReportSchema,
    valid: matchReport,
    invalid: {
      "score over 100": set("baseScore", 101),
      "fractional score": set("baseScore", 66.7),
      "too many regenerations": set("humanizer.regenerations", 3),
      "unknown added section": set("added.0.section", "languages"),
      "added without requirement": set("added.0.requirementIds", []),
    },
  },
];
