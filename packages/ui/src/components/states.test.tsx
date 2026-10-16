import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { formatViolations, runAxe } from "../test/axe";
import { Button } from "./button";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";
import { LoadingState } from "./loading-state";

describe("screen states", () => {
  it("EmptyState has a heading, description and actions", async () => {
    const { container } = render(
      <main>
        <h1>Curadoria</h1>
        <EmptyState
          title="A curadoria ainda não rodou"
          description="A próxima curadoria será qua, 14 out, às 09:00."
          actions={<Button>Rodar agora</Button>}
        />
      </main>,
    );
    expect(
      screen.getByRole("heading", { level: 2, name: "A curadoria ainda não rodou" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Rodar agora" })).toBeVisible();
    const results = await runAxe(container);
    expect(results.violations, formatViolations(results)).toEqual([]);
  });

  it("ErrorState is announced as an alert and keeps the correlation id under support details", async () => {
    const { container } = render(
      <main>
        <h1>Histórico</h1>
        <ErrorState
          title="Não foi possível carregar o histórico"
          description="Seus filtros foram preservados."
          correlationId="corr_123"
          actions={<Button variant="secondary">Tentar novamente</Button>}
        />
      </main>,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Não foi possível carregar o histórico");
    expect(screen.getByText("Detalhes para suporte").closest("details")).not.toHaveAttribute(
      "open",
    );
    expect(screen.getByText("corr_123")).toBeInTheDocument();
    const results = await runAxe(container);
    expect(results.violations, formatViolations(results)).toEqual([]);
  });

  it("LoadingState is a polite status region with a textual alternative", () => {
    render(<LoadingState blocks={2} />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveTextContent("Carregando…");
    expect(status.querySelectorAll("[data-slot=skeleton]")).toHaveLength(6);
  });
});
