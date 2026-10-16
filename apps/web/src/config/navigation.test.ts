import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bottomNavHrefs, drawerItems, isActivePath, navGroups, navItems } from "./navigation";

const APP_DIR = join(__dirname, "..", "app", "(app)");

/** Every route from the task scope must have a page in the App Router. */
const REQUIRED_ROUTES = [
  "/hoje",
  "/curadoria",
  "/estudio",
  "/estudio/[id]",
  "/calendario",
  "/historico",
  "/story-bank",
  "/voice-profile",
  "/fontes",
  "/analytics",
  "/notificacoes",
  "/configuracoes",
];

describe("navigation config", () => {
  it.each(REQUIRED_ROUTES)("has a page.tsx for %s", (route) => {
    expect(existsSync(join(APP_DIR, route, "page.tsx"))).toBe(true);
  });

  it("every nav item points to an existing page", () => {
    for (const item of navItems) {
      expect(existsSync(join(APP_DIR, item.href, "page.tsx")), item.href).toBe(true);
    }
  });

  it("bottom bar has three links plus 'Mais', and the drawer holds the rest without overlap", () => {
    expect(bottomNavHrefs).toHaveLength(3);
    const drawer = drawerItems().map((item) => item.href);
    expect(drawer).not.toEqual(expect.arrayContaining([...bottomNavHrefs]));
    expect(drawer.length + bottomNavHrefs.length).toBe(navItems.length);
  });

  it("isActivePath matches exact and nested paths only", () => {
    expect(isActivePath("/estudio", "/estudio")).toBe(true);
    expect(isActivePath("/estudio/123", "/estudio")).toBe(true);
    expect(isActivePath("/estudio-x", "/estudio")).toBe(false);
    expect(isActivePath("/hoje", "/curadoria")).toBe(false);
  });

  it("groups follow the navigation map: primary, Memória editorial, secondary", () => {
    expect(navGroups).toEqual(["primary", "editorialMemory", "secondary"]);
    const byGroup = (group: string) =>
      navItems.filter((item) => item.group === group).map((item) => item.label);
    expect(byGroup("primary")).toEqual(["Hoje", "Curadoria", "Estúdio", "Calendário", "Histórico"]);
    expect(byGroup("editorialMemory")).toEqual(["Story Bank", "Voice Profile"]);
    expect(byGroup("secondary")).toEqual(["Fontes", "Analytics", "Notificações", "Configurações"]);
  });
});
