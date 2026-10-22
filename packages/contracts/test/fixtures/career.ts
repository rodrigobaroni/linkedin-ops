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
  type CvSegment,
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
    name: "Ana Exemplo",
    email: "ana@example.com",
    phone: null,
    location: "Curitiba, PR",
    links: ["https://example.com/ana"],
  },
  summary: { id: "summary", text: "Engenheira backend com oito anos em sistemas de pagamento." },
  experiences: [
    {
      id: "exp-1",
      company: "Empresa Fictícia S.A.",
      title: "Engenheira de software sênior",
      location: "Remoto",
      startDate: "2021-03",
      endDate: null,
      isCurrent: true,
      bullets: [
        { id: "exp-1-b-1", text: "Liderei a migração do serviço de cobrança para filas duráveis." },
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

export const cvExtractionOutput: CvExtractionOutput = {
  schemaVersion: "1.0",
  injectionSuspected: false,
  injectionEvidence: null,
  ...cvStructured,
  parseWarnings: [],
};

export const jobPostingExtracted: JobPostingExtracted = {
  language: "en",
  languageDetected: "en",
  title: "Senior Backend Engineer",
  company: "Fictional Corp",
  location: "Remote (LATAM)",
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
      kind: "desirable",
      category: "technical",
      text: "Experience with Kafka",
      evidence: "Kafka is a plus",
    },
  ],
  keywords: ["TypeScript", "Kafka"],
};

export const jobExtractionOutput: JobExtractionOutput = {
  schemaVersion: "1.0",
  injectionSuspected: false,
  injectionEvidence: null,
  isJobPosting: true,
  notAJobReason: null,
  ...jobPostingExtracted,
};

const rewritten = (segmentId: string, text: string, source: string): CvSegment => ({
  segmentId,
  text,
  provenance: "rewritten",
  sourceCvItemIds: [source],
  targetRequirementIds: [],
  additionNote: null,
});

const addedSegment: CvSegment = {
  segmentId: "seg-3",
  text: "Evaluated Kafka for event streaming.",
  provenance: "added",
  sourceCvItemIds: [],
  targetRequirementIds: ["req-2"],
  additionNote: "Aproxima a experiência do requisito desejável de Kafka.",
};

export const cvTailoringOutput: CvTailoringOutput = {
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
        rationale: "TypeScript aparece nas competências.",
      },
      {
        requirementId: "req-2",
        status: "missing",
        cvEvidence: [],
        rationale: "Kafka não aparece no CV.",
      },
    ],
  },
  tailoredCv: {
    summary: {
      segments: [
        rewritten("seg-1", "Backend engineer with eight years in payment systems.", "summary"),
      ],
    },
    experiences: [
      {
        cvExperienceId: "exp-1",
        order: 1,
        bullets: {
          segments: [
            rewritten(
              "seg-2",
              "Led the migration of the billing service to durable queues.",
              "exp-1-b-1",
            ),
            addedSegment,
          ],
        },
        skills: {
          segments: [
            {
              segmentId: "seg-4",
              text: "PostgreSQL",
              provenance: "original",
              sourceCvItemIds: ["exp-1-s-1"],
              targetRequirementIds: [],
              additionNote: null,
            },
          ],
        },
      },
    ],
    skills: {
      technical: {
        segments: [
          {
            segmentId: "seg-5",
            text: "TypeScript",
            provenance: "original",
            sourceCvItemIds: ["skill-t-1"],
            targetRequirementIds: ["req-1"],
            additionNote: null,
          },
        ],
      },
      behavioral: { segments: [rewritten("seg-6", "Communication", "skill-b-1")] },
    },
    education: [{ cvEducationId: "edu-1", order: 1 }],
    certifications: [],
    languages: [{ cvLanguageId: "lang-1", order: 1 }],
  },
};

export const cvHumanizationOutput: CvHumanizationOutput = {
  schemaVersion: "1.0",
  injectionSuspected: false,
  injectionEvidence: null,
  segments: [
    {
      segmentId: "seg-2",
      text: "Led the billing service migration to durable queues.",
      changed: true,
      changeReason: "Frase mais direta.",
    },
    { segmentId: "seg-3", text: addedSegment.text, changed: false, changeReason: null },
  ],
};

export const tailoredCvContent: TailoredCvContent = {
  language: "en",
  summary: cvTailoringOutput.tailoredCv.summary,
  experiences: cvTailoringOutput.tailoredCv.experiences.map(
    ({ cvExperienceId, bullets, skills }) => ({ cvExperienceId, bullets, skills }),
  ),
  skills: cvTailoringOutput.tailoredCv.skills,
  educationIds: ["edu-1"],
  certificationIds: [],
  languageIds: ["lang-1"],
};

export const matchReport: MatchReport = {
  schemaVersion: "1.0",
  scoringVersion: "1.0.0",
  baseScore: 70,
  jobLanguage: "en",
  cvLanguage: "en",
  requirements: [
    {
      requirementId: "req-1",
      text: "5+ years with TypeScript",
      kind: "mandatory",
      category: "technical",
      status: "met",
      cvEvidence: [{ cvItemId: "skill-t-1", quote: "TypeScript" }],
      rationale: "TypeScript aparece nas competências.",
      evidenceRejected: false,
    },
    {
      requirementId: "req-2",
      text: "Experience with Kafka",
      kind: "desirable",
      category: "technical",
      status: "missing",
      cvEvidence: [],
      rationale: "Kafka não aparece no CV.",
      evidenceRejected: false,
    },
  ],
  added: [
    {
      segmentId: "seg-3",
      section: "experience-bullets",
      cvExperienceId: "exp-1",
      text: addedSegment.text,
      targetRequirementIds: ["req-2"],
      additionNote: "Aproxima a experiência do requisito desejável de Kafka.",
    },
  ],
  humanizer: {
    rulesVersion: "cv-banned-phrases@1.0.0",
    passed: true,
    regenerations: 0,
    failedRuleIds: [],
    revertedSegmentIds: [],
  },
  warnings: [],
};

export const careerCases: SchemaCase[] = [
  {
    name: "CvStructured",
    schema: CvStructuredSchema,
    valid: cvStructured,
    invalid: {
      "duplicate item id": set("skills.technical.0.id", "exp-1"),
      "duplicate nested id": set("experiences.0.skills.0.id", "exp-1-b-1"),
      "unknown key (strict)": set("contact.photo", "x"),
      "missing summary": drop("summary"),
      "language outside enum": set("language", "es"),
      "uppercase id": set("education.0.id", "EDU-1"),
      "name too long": set("contact.name", repeat("a", 201)),
    },
  },
  {
    name: "CvExtractionOutput",
    schema: CvExtractionOutputSchema,
    valid: cvExtractionOutput,
    invalid: {
      "wrong schemaVersion": set("schemaVersion", "2.0"),
      "missing injectionEvidence": drop("injectionEvidence"),
      "missing parseWarnings": drop("parseWarnings"),
    },
  },
  {
    name: "JobPostingExtracted",
    schema: JobPostingExtractedSchema,
    valid: jobPostingExtracted,
    invalid: {
      "no requirements": set("requirements", []),
      "duplicate requirement id": set("requirements.1.id", "req-1"),
      "unknown kind": set("requirements.0.kind", "required"),
      "evidence too long": set("requirements.0.evidence", repeat("a", 201)),
      "bad language tag": set("languageDetected", "Spanish"),
    },
  },
  {
    name: "JobExtractionOutput",
    schema: JobExtractionOutputSchema,
    valid: jobExtractionOutput,
    invalid: {
      "posting without title": set("title", null),
      "not a job without reason": set("isJobPosting", false),
    },
  },
  {
    name: "CvTailoringOutput",
    schema: CvTailoringOutputSchema,
    valid: cvTailoringOutput,
    invalid: {
      "added without target requirement": set(
        "tailoredCv.experiences.0.bullets.segments.1.targetRequirementIds",
        [],
      ),
      "added without note": set("tailoredCv.experiences.0.bullets.segments.1.additionNote", null),
      "added with base source": set("tailoredCv.experiences.0.bullets.segments.1.sourceCvItemIds", [
        "exp-1",
      ]),
      "rewritten without source": set("tailoredCv.summary.segments.0.sourceCvItemIds", []),
      "unknown provenance": set("tailoredCv.summary.segments.0.provenance", "inferred"),
      "model returns a score (strict)": set("matchAssessment.score", 80),
      "target language outside enum": set("targetLanguage", "es"),
      "rationale too long": set("matchAssessment.requirements.0.rationale", repeat("a", 241)),
    },
  },
  {
    name: "CvHumanizationOutput",
    schema: CvHumanizationOutputSchema,
    valid: cvHumanizationOutput,
    invalid: {
      "provenance in output (strict)": set("segments.0.provenance", "original"),
      "missing changed": drop("segments.0.changed"),
    },
  },
  {
    name: "TailoredCvContent",
    schema: TailoredCvContentSchema,
    valid: tailoredCvContent,
    invalid: {
      "duplicate segment id": set("skills.technical.segments.0.segmentId", "seg-1"),
      "order leaked (strict)": set("experiences.0.order", 1),
      "language outside enum": set("language", "other"),
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
      "added without requirement": set("added.0.targetRequirementIds", []),
      "unknown warning": set("warnings", ["low_score"]),
    },
  },
];
