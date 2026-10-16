import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AutonomyIndicator } from "@/components/shell/autonomy-indicator";
import { messages } from "@/i18n/pt-br";
import { AutonomyModeProvider } from "./autonomy-mode-provider";

vi.mock("next/navigation", async () => (await import("@/test/next-navigation")).navigationMock);

describe("AutonomyIndicator + provider", () => {
  it("reflects the configured cancel window for the controlled autopilot", async () => {
    render(
      <AutonomyModeProvider
        value={{
          mode: "AUTOPILOT_CONTROLLED",
          cancelWindowMinutes: 45,
          mediaRequiresHuman: true,
          source: "mock",
        }}
      >
        <AutonomyIndicator />
      </AutonomyModeProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: /Modo Controlado/ }));
    const popover = await screen.findByRole("dialog", { name: messages.autonomy.learnMore });
    expect(popover).toHaveTextContent("Piloto automático controlado");
    expect(popover).toHaveTextContent(messages.autonomy.cancelWindow(45));
    expect(popover).toHaveTextContent(messages.autonomy.mediaRequiresHuman);
  });

  it("states that the full autopilot has no cancel window", async () => {
    render(
      <AutonomyModeProvider
        value={{
          mode: "AUTOPILOT_FULL",
          cancelWindowMinutes: 60,
          mediaRequiresHuman: true,
          source: "mock",
        }}
      >
        <AutonomyIndicator />
      </AutonomyModeProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: /Modo Completo/ }));
    const popover = await screen.findByRole("dialog", { name: messages.autonomy.learnMore });
    expect(popover).toHaveTextContent(messages.autonomy.noCancelWindow);
    expect(popover).not.toHaveTextContent("Janela de cancelamento:");
  });
});
