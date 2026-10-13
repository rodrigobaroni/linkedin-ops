import type { Route } from "next";
import {
  BarChart3Icon,
  BellIcon,
  BookOpenIcon,
  CalendarDaysIcon,
  HistoryIcon,
  HomeIcon,
  type LucideIcon,
  MicVocalIcon,
  MoreHorizontalIcon,
  PenSquareIcon,
  RssIcon,
  SettingsIcon,
  SparklesIcon,
} from "lucide-react";

/** Navigation groups mirror docs/product/design/navigation-map.md ("Navegação global"). */
export type NavGroup = "main" | "editorialMemory";

export type NavItem = {
  href: Route;
  label: string;
  icon: LucideIcon;
  group: NavGroup;
};

export const navItems: readonly NavItem[] = [
  { href: "/hoje", label: "Hoje", icon: HomeIcon, group: "main" },
  { href: "/curadoria", label: "Curadoria", icon: SparklesIcon, group: "main" },
  { href: "/estudio", label: "Estúdio", icon: PenSquareIcon, group: "main" },
  { href: "/calendario", label: "Calendário", icon: CalendarDaysIcon, group: "main" },
  { href: "/historico", label: "Histórico", icon: HistoryIcon, group: "main" },
  { href: "/story-bank", label: "Story Bank", icon: BookOpenIcon, group: "editorialMemory" },
  { href: "/voice-profile", label: "Voice Profile", icon: MicVocalIcon, group: "editorialMemory" },
  { href: "/fontes", label: "Fontes", icon: RssIcon, group: "main" },
  { href: "/analytics", label: "Analytics", icon: BarChart3Icon, group: "main" },
  { href: "/notificacoes", label: "Notificações", icon: BellIcon, group: "main" },
  { href: "/configuracoes", label: "Configurações", icon: SettingsIcon, group: "main" },
] as const;

/** Mobile bottom bar: four destinations with always-visible labels; "Mais" opens the drawer. */
export const bottomNavHrefs: readonly Route[] = ["/hoje", "/curadoria", "/calendario"];

export const moreIcon = MoreHorizontalIcon;

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Items shown inside the mobile "Mais" drawer: everything not in the bottom bar. */
export function drawerItems(): NavItem[] {
  return navItems.filter((item) => !bottomNavHrefs.includes(item.href));
}
