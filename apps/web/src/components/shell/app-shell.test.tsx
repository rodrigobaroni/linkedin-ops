import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlaceholderScreen } from "@/components/placeholder-screen";
import { navItems } from "@/config/navigation";
import { messages } from "@/i18n/pt-br";
import { AppProviders } from "@/providers/app-providers";
import { formatViolations, runAxe } from "@/test/axe";
import { setPathname } from "@/test/next-navigation";
import { AppShell } from "./app-shell";

vi.mock("next/navigation", async () => (await import("@/test/next-navigation")).navigationMock);

function renderShell(pathname = "/curadoria") {
  setPathname(pathname);
  return render(
    <AppProviders>
      <AppShell>
        <PlaceholderScreen screen="curadoria" pathname="/curadoria" />
      </AppShell>
    </AppProviders>,
  );
}

describe("AppShell", () => {
  beforeEach(() => {
    setPathname("/curadoria");
  });

  it("starts with the skip link and exposes the main landmarks", () => {
    const { container } = renderShell();
    const skip = screen.getByRole("link", { name: messages.skipLink });
    expect(container.querySelector("a")).toBe(skip);
    expect(skip).toHaveAttribute("href", "#conteudo-principal");

    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "conteudo-principal");
    expect(screen.getByRole("navigation", { name: messages.nav.primary })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: messages.nav.bottom })).toBeInTheDocument();
    expect(within(main).getByRole("heading", { level: 1, name: "Curadoria" })).toHaveAttribute(
      "tabindex",
      "-1",
    );
  });

  it("lists every destination of the navigation map in the sidebar, in order", () => {
    renderShell();
    const sidebar = screen.getByRole("navigation", { name: messages.nav.primary });
    const labels = within(sidebar)
      .getAllByRole("link")
      .map((link) => link.textContent?.trim());
    expect(labels).toEqual([
      "Hoje",
      "Curadoria",
      "Estúdio",
      "Calendário",
      "Histórico",
      "Story Bank",
      "Voice Profile",
      "Fontes",
      "Analytics",
      "Notificações",
      "Configurações",
    ]);
    expect(within(sidebar).getByText(messages.nav.editorialMemory)).toBeInTheDocument();
  });

  it("marks the active route with aria-current, including nested paths", () => {
    renderShell("/estudio/abc");
    const sidebar = screen.getByRole("navigation", { name: messages.nav.primary });
    const current = within(sidebar).getAllByRole("link", { current: "page" });
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("Estúdio");
  });

  it("shows the autonomy mode badge with a textual label (mocked ASSISTED)", () => {
    renderShell();
    const badges = screen.getAllByText("Modo Assistido");
    // Sidebar footer + page header: always visible regardless of breakpoint.
    expect(badges.length).toBeGreaterThanOrEqual(2);
    expect(badges[0]?.closest("[data-mode]")).toHaveAttribute("data-mode", "ASSISTED");
  });

  it("shows the LinkedIn connection status as text", () => {
    renderShell();
    expect(screen.getAllByText("LinkedIn: Conectado").length).toBeGreaterThanOrEqual(1);
  });

  it("offers four mobile destinations and opens the 'Mais' drawer with the remaining ones", async () => {
    renderShell("/fontes");
    const bottom = screen.getByRole("navigation", { name: messages.nav.bottom });
    const items = within(bottom).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(within(bottom).getByRole("link", { name: "Hoje" })).toBeInTheDocument();
    expect(within(bottom).getByRole("link", { name: "Curadoria" })).toBeInTheDocument();
    expect(within(bottom).getByRole("link", { name: "Calendário" })).toBeInTheDocument();

    const more = within(bottom).getByRole("button", { name: messages.nav.more });
    // /fontes lives inside the drawer, so the trigger is marked as containing the current page.
    expect(more).toHaveAttribute("aria-current", "true");

    await userEvent.click(more);
    const dialog = await screen.findByRole("dialog", { name: messages.nav.more });
    const drawerNav = within(dialog).getByRole("navigation", { name: messages.nav.more });
    const drawerLinks = within(drawerNav)
      .getAllByRole("link")
      .map((link) => link.textContent?.trim());
    const expected = navItems
      .filter((item) => !["/hoje", "/curadoria", "/calendario"].includes(item.href))
      .map((item) => item.label);
    expect(drawerLinks).toEqual(expected);
    expect(within(dialog).getByText("Modo Assistido")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: /LinkedIn: Conectado/ })).toBeInTheDocument();
    expect(
      within(drawerNav).getByRole("link", { name: "Fontes", current: "page" }),
    ).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(more).toHaveFocus();
  });

  it("has no axe violations (jsdom, contrast excluded)", async () => {
    const { container } = renderShell();
    const results = await runAxe(container);
    expect(results.violations, formatViolations(results)).toEqual([]);
  });
});
