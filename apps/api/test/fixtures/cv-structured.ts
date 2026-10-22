import type { CvStructured } from "@linkedin-ops/contracts";

/** Structured form of `fictitiousCvPdf` (what `cv.extract` would return); nobody's real data. */
export function fictitiousCvStructured(marker = "CANARIO-0000"): CvStructured {
  return {
    language: "pt-BR",
    contact: {
      name: "Ana Exemplo da Silva",
      email: "ana.exemplo@example.test",
      phone: "+55 11 90000-0000",
      location: "São Paulo, SP",
      links: [],
    },
    summary: { id: "summary", text: `Engenheira com foco em sistemas distribuídos. ${marker}` },
    experiences: [
      {
        id: "exp-1",
        company: "Empresa Fictícia S.A.",
        title: "Engenheira Sênior",
        location: null,
        startDate: "2021",
        endDate: null,
        isCurrent: true,
        bullets: [{ id: "exp-1-b-1", text: "Conduziu a migração de filas para PostgreSQL." }],
        skills: [{ id: "exp-1-s-1", text: "PostgreSQL" }],
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
    certifications: [],
    skills: { technical: [{ id: "skill-1", text: "TypeScript" }], behavioral: [] },
    languages: [{ id: "lang-1", language: "Inglês", level: "fluente" }],
    other: [],
  };
}
