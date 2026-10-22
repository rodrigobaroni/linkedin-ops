import type { Route } from "next";
import {
  BarChart3Icon,
  BellIcon,
  BookOpenIcon,
  CalendarDaysIcon,
  FileTextIcon,
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
import { messages } from "@/i18n/pt-br";

/**
 * Navigation groups mirror docs/product/design/navigation-map.md ("Navegação global"): primary
 * destinations, the "Memória editorial" group, the "Carreira" group (CV module, spec 2026-10-22), then
 * the secondary ones. Rendering follows `navGroups`.
 */
export type NavGroup = "primary" | "editorialMemory" | "career" | "secondary";

export const navGroups: readonly NavGroup[] = ["primary", "editorialMemory", "career", "secondary"];

/** Visible group headings (sidebar and the mobile "Mais" drawer); groups without one have none. */
export const navGroupHeadings: Partial<Record<NavGroup, string>> = {
  editorialMemory: messages.nav.editorialMemory,
  career: messages.nav.career,
};

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
  { href: "/carreira/cv", label: "Meu CV", icon: FileTextIcon, group: "career" },
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
