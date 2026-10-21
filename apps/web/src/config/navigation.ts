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
  SendIcon,
  SettingsIcon,
  SparklesIcon,
} from "lucide-react";

/**
 * Navigation groups mirror docs/product/design/navigation-map.md ("Navegação global"): primary
 * destinations, the "Memória editorial" group, then the secondary ones. Rendering follows `navGroups`.
 */
export type NavGroup = "primary" | "editorialMemory" | "secondary";

export const navGroups: readonly NavGroup[] = ["primary", "editorialMemory", "secondary"];

export type NavItem = {
  href: Route;
  label: string;
  icon: LucideIcon;
  group: NavGroup;
};

export const navItems: readonly NavItem[] = [
  { href: "/hoje", label: "Hoje", icon: HomeIcon, group: "primary" },
  // MVP-0: manual text post published now (the only flow live in production for now).
  { href: "/publicar", label: "Publicar", icon: SendIcon, group: "primary" },
  { href: "/curadoria", label: "Curadoria", icon: SparklesIcon, group: "primary" },
  { href: "/estudio", label: "Estúdio", icon: PenSquareIcon, group: "primary" },
  { href: "/calendario", label: "Calendário", icon: CalendarDaysIcon, group: "primary" },
  { href: "/historico", label: "Histórico", icon: HistoryIcon, group: "primary" },
  { href: "/story-bank", label: "Story Bank", icon: BookOpenIcon, group: "editorialMemory" },
  { href: "/voice-profile", label: "Voice Profile", icon: MicVocalIcon, group: "editorialMemory" },
  { href: "/fontes", label: "Fontes", icon: RssIcon, group: "secondary" },
  { href: "/analytics", label: "Analytics", icon: BarChart3Icon, group: "secondary" },
  { href: "/notificacoes", label: "Notificações", icon: BellIcon, group: "secondary" },
  { href: "/configuracoes", label: "Configurações", icon: SettingsIcon, group: "secondary" },
] as const;

/** Mobile bottom bar: four destinations with always-visible labels; "Mais" opens the drawer. */
export const bottomNavHrefs: readonly Route[] = ["/hoje", "/publicar", "/curadoria"];

export const moreIcon = MoreHorizontalIcon;

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Items shown inside the mobile "Mais" drawer: everything not in the bottom bar. */
export function drawerItems(): NavItem[] {
  return navItems.filter((item) => !bottomNavHrefs.includes(item.href));
}
