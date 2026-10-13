import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { navItems } from "@/config/navigation";
import { setPathname } from "@/test/next-navigation";
import { NavLink } from "./nav-link";

vi.mock("next/navigation", async () => (await import("@/test/next-navigation")).navigationMock);

const notifications = navItems.find((item) => item.href === "/notificacoes")!;

describe("NavLink", () => {
  it("announces the unread count once, through the label", () => {
    setPathname("/hoje");
    render(<NavLink item={notifications} count={2} countLabel="2 não lidas" />);
    expect(screen.getByRole("link", { name: "Notificações, 2 não lidas" })).toBeInTheDocument();
  });

  it("marks the active route with aria-current", () => {
    setPathname("/notificacoes");
    render(<NavLink item={notifications} />);
    expect(screen.getByRole("link", { name: "Notificações" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
