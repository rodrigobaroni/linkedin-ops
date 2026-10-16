import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AUTONOMY_MODES } from "../types/autonomy";
import { AUTONOMY_MODE_PRESENTATION, AutonomyModeBadge } from "./autonomy-mode-badge";

describe("AutonomyModeBadge", () => {
  it.each(AUTONOMY_MODES)("shows the textual label for %s", (mode) => {
    render(<AutonomyModeBadge mode={mode} prefix="Modo" />);
    const badge = screen.getByText(`Modo ${AUTONOMY_MODE_PRESENTATION[mode].label}`);
    expect(badge.closest("[data-slot=autonomy-mode-badge]")).toHaveAttribute("data-mode", mode);
  });

  it("hides the icon from assistive technology", () => {
    const { container } = render(<AutonomyModeBadge mode="ASSISTED" />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
