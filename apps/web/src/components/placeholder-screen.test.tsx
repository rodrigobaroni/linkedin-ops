import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { screens } from "@/config/screens";
import { AppProviders } from "@/providers/app-providers";
import { formatViolations, runAxe } from "@/test/axe";
import { PlaceholderScreen, parseScreenState } from "./placeholder-screen";

vi.mock("next/navigation", async () => (await import("@/test/next-navigation")).navigationMock);

describe("parseScreenState", () => {
  it("falls back to the empty state for unknown or missing values", () => {
    expect(parseScreenState(undefined)).toBe("vazio");
    expect(parseScreenState("qualquer")).toBe("vazio");
    expect(parseScreenState(["erro"])).toBe("erro");
    expect(parseScreenState("carregando")).toBe("carregando");
  });
});

describe("PlaceholderScreen", () => {
  it("renders the empty state by default with the screen copy", async () => {
    const { container } = render(
      <AppProviders>
        <main>
          <PlaceholderScreen screen="historico" pathname="/historico" />
        </main>
      </AppProviders>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Histórico" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: screens.historico.empty.title }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir para Curadoria" })).toHaveAttribute(
      "href",
      "/curadoria",
    );
    // Breadcrumb: Início › Histórico (current).
    const breadcrumb = screen.getByRole("navigation", { name: "Caminho de navegação" });
    expect(breadcrumb).toHaveTextContent("Início");
    expect(breadcrumb.querySelector("[aria-current=page]")).toHaveTextContent("Histórico");
    const results = await runAxe(container);
    expect(results.violations, formatViolations(results)).toEqual([]);
  });

  it("renders the loading state as a polite status region", () => {
    render(
      <AppProviders>
        <PlaceholderScreen screen="curadoria" pathname="/curadoria" state="carregando" />
      </AppProviders>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Carregando Curadoria");
  });

  it("renders the error state with a retry action", () => {
    render(
      <AppProviders>
        <PlaceholderScreen screen="analytics" pathname="/analytics" state="erro" />
      </AppProviders>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar Analytics");
    expect(screen.getByRole("link", { name: "Tentar novamente" })).toHaveAttribute(
      "href",
      "/analytics",
    );
  });

  it("renders nested breadcrumbs for the Estúdio item", () => {
    render(
      <AppProviders>
        <PlaceholderScreen screen="estudioItem" pathname="/estudio/abc" meta="ID do item: abc" />
      </AppProviders>,
    );
    const breadcrumb = screen.getByRole("navigation", { name: "Caminho de navegação" });
    expect(breadcrumb).toHaveTextContent("Início");
    expect(breadcrumb).toHaveTextContent("Estúdio");
    expect(screen.getByText("ID do item: abc")).toBeInTheDocument();
  });
});
