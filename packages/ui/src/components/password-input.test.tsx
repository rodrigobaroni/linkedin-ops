import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { formatViolations, runAxe } from "../test/axe";
import { FormField } from "./form-field";
import { PasswordInput } from "./password-input";
import { Spinner } from "./spinner";
import { Textarea } from "./textarea";

describe("PasswordInput", () => {
  it("toggles visibility with a dynamic accessible name and keeps the value", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <FormField label="Senha">
        {(control) => <PasswordInput {...control} autoComplete="current-password" />}
      </FormField>,
    );
    const input = screen.getByLabelText("Senha");
    expect(input).toHaveAttribute("type", "password");
    await user.type(input, "segredo-de-teste");
    await user.click(screen.getByRole("button", { name: "Mostrar senha" }));
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveValue("segredo-de-teste");
    await user.click(screen.getByRole("button", { name: "Ocultar senha" }));
    expect(input).toHaveAttribute("type", "password");
    const results = await runAxe(container);
    expect(results.violations, formatViolations(results)).toEqual([]);
  });
});

describe("Spinner and Textarea", () => {
  it("hides the spinner from assistive tech and labels the textarea", async () => {
    const { container } = render(
      <>
        <Spinner data-testid="spinner" />
        <FormField label="Texto">{(control) => <Textarea {...control} />}</FormField>
      </>,
    );
    expect(screen.getByTestId("spinner")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("textbox", { name: "Texto" })).toBeInTheDocument();
    const results = await runAxe(container);
    expect(results.violations, formatViolations(results)).toEqual([]);
  });
});
