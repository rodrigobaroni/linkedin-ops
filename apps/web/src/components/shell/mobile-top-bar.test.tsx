import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { setPathname } from "@/test/next-navigation";
import { MobileTopBar, parentRoute } from "./mobile-top-bar";

vi.mock("next/navigation", async () => (await import("@/test/next-navigation")).navigationMock);

describe("parentRoute", () => {
  it("returns the parent segment for nested routes and null at the top level", () => {
    expect(parentRoute("/estudio/abc")).toBe("/estudio");
    expect(parentRoute("/configuracoes/integracoes/linkedin")).toBe("/configuracoes/integracoes");
    expect(parentRoute("/hoje")).toBeNull();
    expect(parentRoute("/")).toBeNull();
  });
});

describe("MobileTopBar", () => {
  it("offers an in-app 'Voltar' link on nested routes only", () => {
    setPathname("/estudio/abc");
    const { unmount } = render(<MobileTopBar unreadNotifications={0} />);
    expect(screen.getByRole("link", { name: "Voltar" })).toHaveAttribute("href", "/estudio");
    unmount();

    setPathname("/hoje");
    render(<MobileTopBar unreadNotifications={0} />);
    expect(screen.queryByRole("link", { name: "Voltar" })).not.toBeInTheDocument();
  });

  it("names the bell with the unread count", () => {
    setPathname("/hoje");
    render(<MobileTopBar unreadNotifications={2} />);
    expect(screen.getByRole("link", { name: "Notificações: 2 não lidas" })).toBeInTheDocument();
  });
});
