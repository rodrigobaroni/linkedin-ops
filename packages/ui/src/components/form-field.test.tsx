import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { formatViolations, runAxe } from "../test/axe";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";
import { FormField } from "./form-field";
import { Input } from "./input";
import { Button } from "./button";

describe("FormField + Input", () => {
  it("links label, description and error to the control", async () => {
    const { container } = render(
      <FormField
        label="E-mail"
        description="Use o e-mail cadastrado."
        error="Informe um e-mail."
        required
      >
        {(control) => <Input type="email" autoComplete="username" {...control} />}
      </FormField>,
    );
    const input = screen.getByRole("textbox", { name: /E-mail/ });
    expect(input).toHaveAccessibleDescription("Use o e-mail cadastrado. Informe um e-mail.");
    expect(input).toBeInvalid();
    expect(input).toBeRequired();
    expect(screen.getByText("(obrigatório)")).toHaveClass("sr-only");
    const results = await runAxe(container);
    expect(results.violations, formatViolations(results)).toEqual([]);
  });

  it("is valid and has no describedby without description or error", () => {
    render(<FormField label="Nome">{(control) => <Input {...control} />}</FormField>);
    const input = screen.getByRole("textbox", { name: "Nome" });
    expect(input).not.toHaveAttribute("aria-describedby");
    expect(input).not.toHaveAttribute("aria-invalid");
  });
});

describe("Dialog", () => {
  it("opens as a labelled modal, closes on Escape and restores focus", async () => {
    const { baseElement } = render(
      <Dialog>
        <DialogTrigger asChild>
          <Button>Abrir</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirme sua senha</DialogTitle>
            <DialogDescription>Esta ação exige confirmação.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline">Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    );
    const trigger = screen.getByRole("button", { name: "Abrir" });
    await userEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Confirme sua senha" });
    // Radix hides the rest of the page from assistive tech (`aria-hidden`) instead of `aria-modal`.
    expect(trigger.closest("[aria-hidden='true']")).not.toBeNull();
    expect(dialog).toHaveAccessibleDescription("Esta ação exige confirmação.");
    expect(screen.getByRole("button", { name: "Fechar" })).toBeInTheDocument();

    const results = await runAxe(baseElement);
    expect(results.violations, formatViolations(results)).toEqual([]);

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
