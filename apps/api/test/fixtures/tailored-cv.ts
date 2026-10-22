import type {
  CvSegment,
  CvSegmentList,
  CvStructured,
  TailoredCvContent,
} from "@linkedin-ops/contracts";

/** Fictitious base CV + tailored CV for the PDF renderer (spec §10: nobody's real data). */

/** Printed nowhere: `additionNote` of every `added` segment. The PDF must not contain it. */
export const ADDITION_NOTE_MARKER = "NOTA-DE-ACRESCIMO-0000";

/** Every accented letter of Portuguese, to prove the embedded font maps them to selectable text. */
export const PT_ACCENTS = "àáâãçéêíóôõúü ÀÁÂÃÇÉÊÍÓÔÕÚÜ";

let segmentCounter = 0;

function segment(
  text: string,
  provenance: CvSegment["provenance"],
  sourceId = "summary",
): CvSegment {
  segmentCounter += 1;
  return provenance === "added"
    ? {
        segmentId: `seg-${segmentCounter}`,
        text,
        provenance,
        sourceCvItemIds: [],
        targetRequirementIds: ["req-1"],
        additionNote: `${ADDITION_NOTE_MARKER} acrescentado para cobrir o requisito`,
      }
    : {
        segmentId: `seg-${segmentCounter}`,
        text,
        provenance,
        sourceCvItemIds: [sourceId],
        targetRequirementIds: [],
        additionNote: null,
      };
}

function segments(...items: CvSegment[]): CvSegmentList {
  return { segments: items };
}

export function fictitiousBaseCv(): CvStructured {
  return {
    language: "pt-BR",
    contact: {
      name: "Ana Exemplo da Conceição",
      email: "ana.exemplo@example.test",
      phone: "+55 11 90000-0000",
      location: "São Paulo, SP",
      links: ["https://example.test/ana"],
    },
    summary: { id: "summary", text: "Engenheira com foco em sistemas distribuídos." },
    experiences: [
      {
        id: "exp-1",
        company: "Empresa Fictícia S.A.",
        title: "Engenheira Sênior",
        location: "Remoto",
        startDate: "2021-03",
        endDate: null,
        isCurrent: true,
        bullets: [{ id: "exp-1-b-1", text: "Conduziu a migração de filas para PostgreSQL." }],
        skills: [{ id: "exp-1-s-1", text: "PostgreSQL" }],
      },
      {
        id: "exp-2",
        company: "Cooperativa Imaginária",
        title: "Desenvolvedora Pleno",
        location: "Curitiba, PR",
        startDate: "2017-01",
        endDate: "2021-02",
        isCurrent: false,
        bullets: [{ id: "exp-2-b-1", text: "Manteve a integração de pagamentos." }],
        skills: [],
      },
    ],
    education: [
      {
        id: "edu-1",
        institution: "Universidade Imaginária",
        degree: "Bacharelado",
        field: "Ciência da Computação",
        startDate: "2012",
        endDate: "2016",
      },
    ],
    certifications: [
      { id: "cert-1", name: "Certificação Fictícia", issuer: "Instituto Exemplo", date: "2022" },
    ],
    skills: {
      technical: [{ id: "skill-t-1", text: "TypeScript" }],
      behavioral: [{ id: "skill-b-1", text: "Comunicação" }],
    },
    languages: [
      { id: "lang-1", language: "Inglês", level: "fluente" },
      { id: "lang-2", language: "Espanhol", level: null },
    ],
    other: [],
  };
}

export function fictitiousTailoredCv(): TailoredCvContent {
  segmentCounter = 0;
  return {
    language: "pt-BR",
    summary: segments(
      segment("Engenheira de backend com foco em sistemas distribuídos e confiáveis.", "rewritten"),
      segment(
        `Atuação em migrações críticas, com atenção à observação de produção: ${PT_ACCENTS}.`,
        "original",
      ),
    ),
    experiences: [
      {
        cvExperienceId: "exp-1",
        bullets: segments(
          segment(
            "Conduziu a migração de filas para PostgreSQL sem interrupção do serviço.",
            "rewritten",
            "exp-1-b-1",
          ),
          segment("Definiu alertas de latência para a cobrança recorrente.", "added"),
        ),
        skills: segments(segment("PostgreSQL", "original", "exp-1-s-1")),
      },
      {
        cvExperienceId: "exp-2",
        bullets: segments(segment("Manteve a integração de pagamentos.", "original", "exp-2-b-1")),
        skills: segments(),
      },
    ],
    skills: {
      technical: segments(
        segment("TypeScript", "original", "skill-t-1"),
        segment("Kafka", "added"),
      ),
      behavioral: segments(segment("Comunicação", "original", "skill-b-1")),
    },
    educationIds: ["edu-1"],
    certificationIds: ["cert-1"],
    languageIds: ["lang-1", "lang-2"],
  };
}

/**
 * A long tailored CV (many experiences, long bullets) that spans several pages, to prove pagination keeps
 * every line. Bullet `n` of experience `e` ends with the token `FIM-e-n`.
 */
export function longTailoredCv(
  experiences = 8,
  bulletsPerExperience = 8,
): {
  base: CvStructured;
  content: TailoredCvContent;
} {
  segmentCounter = 0;
  const base = fictitiousBaseCv();
  base.experiences = Array.from({ length: experiences }, (_, e) => ({
    id: `exp-${e + 1}`,
    company: `Empresa Fictícia ${e + 1}`,
    title: "Engenheira de Software",
    location: null,
    startDate: `${2000 + e}`,
    endDate: `${2001 + e}`,
    isCurrent: false,
    bullets: [{ id: `exp-${e + 1}-b-1`, text: "Texto base." }],
    skills: [],
  }));
  const content = fictitiousTailoredCv();
  content.experiences = base.experiences.map((experience, e) => ({
    cvExperienceId: experience.id,
    bullets: segments(
      ...Array.from({ length: bulletsPerExperience }, (_, n) =>
        segment(
          `Responsável por evolução contínua de serviços de integração, com revisão de código, ` +
            `planejamento de capacidade e documentação técnica para o time de operação. FIM-${e + 1}-${n + 1}`,
          "rewritten",
          `exp-${e + 1}-b-1`,
        ),
      ),
    ),
    skills: segments(),
  }));
  return { base, content };
}
