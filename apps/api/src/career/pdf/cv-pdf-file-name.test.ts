import { describe, expect, it } from "vitest";
import { cvPdfFileName } from "./cv-pdf-file-name.js";

describe("cvPdfFileName", () => {
  it("derives the name from the base CV contact, without accents or spaces", () => {
    expect(
      cvPdfFileName({
        name: "Ana Exemplo da Conceição",
        company: "Empresa Fictícia S.A.",
        title: "Engenheira de Software Sênior",
      }),
    ).toBe("CV-Ana-Exemplo-da-Conceicao-Empresa-Ficticia-S-A-Engenheira-de-Software-Senior.pdf");
  });

  it("strips path separators, dots and control characters", () => {
    const name = cvPdfFileName({
      name: "../../etc/passwd",
      company: 'Acme\\Corp\r\n"; filename=x.exe',
      title: "Dev / Ops",
    });
    expect(name).toBe("CV-etc-passwd-Acme-Corp-filename-x-exe-Dev-Ops.pdf");
    expect(name).toMatch(/^[A-Za-z0-9-]+\.pdf$/);
  });

  it("omits missing or empty parts instead of leaving double hyphens", () => {
    expect(cvPdfFileName({ name: null, company: "Fictional Corp", title: null })).toBe(
      "CV-Fictional-Corp.pdf",
    );
    expect(cvPdfFileName({ name: "ção", company: "日本", title: "  " })).toBe("CV-cao.pdf");
  });

  it("caps each part so the name stays short", () => {
    const long = "Palavra ".repeat(30);
    const name = cvPdfFileName({ name: long, company: long, title: long });
    expect(name.length).toBeLessThanOrEqual("CV-".length + 3 * 41 + ".pdf".length);
    expect(name).not.toMatch(/--|-\.pdf$/);
  });
});
