import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it("renders a type=button by default and forwards clicks", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Selecionar e gerar</Button>);
    const button = screen.getByRole("button", { name: "Selecionar e gerar" });
    expect(button).toHaveAttribute("type", "button");
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders the child element with asChild (e.g. a link)", () => {
    render(
      <Button asChild variant="outline">
        <a href="/curadoria">Ver as 5 oportunidades</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Ver as 5 oportunidades" });
    expect(link).toHaveAttribute("href", "/curadoria");
    expect(link).not.toHaveAttribute("type");
  });
});
