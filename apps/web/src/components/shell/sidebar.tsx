"use client";

import { Button, Separator, cn } from "@linkedin-ops/ui";
import { PanelLeftCloseIcon, PanelLeftOpenIcon, UserRoundIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { LinkedInConnectionStatus } from "@/config/mock";
import { type NavItem, navItems } from "@/config/navigation";
import { messages } from "@/i18n/pt-br";
import { AutonomyIndicator } from "./autonomy-indicator";
import { LinkedInStatus } from "./linkedin-status";
import { NavLink } from "./nav-link";

export type SidebarProps = {
  linkedInStatus: LinkedInConnectionStatus;
  unreadNotifications: number;
  accountName: string;
};

/**
 * Desktop sidebar (≥ 1024 px: 256 px, collapsible to 72 px) and tablet rail (768–1023 px: icons +
 * tooltips). Hidden below 768 px, where the bottom navigation takes over (navigation-map.md).
 * Icon-only modes keep every label in the accessibility tree (`sr-only`) and as a `title` tooltip.
 */
export function Sidebar({ linkedInStatus, unreadNotifications, accountName }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  // Order from the navigation map: main items, then the "Memória editorial" group, then the rest.
  const main = navItems.filter((item) => item.group === "main");
  const memory = navItems.filter((item) => item.group === "editorialMemory");
  const sections: { key: string; heading?: string; items: NavItem[] }[] = [
    { key: "primary", items: main.slice(0, 5) },
    { key: "memory", heading: messages.nav.editorialMemory, items: memory },
    { key: "secondary", items: main.slice(5) },
  ];

  // Labels are visible only on lg+ while expanded.
  const labelClassName = "max-lg:sr-only lg:group-data-collapsed:sr-only";

  return (
    <aside
      data-slot="sidebar"
      data-collapsed={collapsed ? "" : undefined}
      className={cn(
        "group sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-card md:flex",
        "w-sidebar-collapsed lg:w-sidebar lg:data-collapsed:w-sidebar-collapsed",
      )}
    >
      <div className="flex h-16 items-center justify-between gap-2 px-3 lg:px-4">
        <Link
          href="/hoje"
          className="min-w-0 truncate text-base font-bold leading-6 text-foreground max-lg:flex max-lg:w-full max-lg:justify-center lg:group-data-collapsed:flex lg:group-data-collapsed:justify-center"
        >
          <span className={labelClassName}>{messages.app.name}</span>
          <span
            aria-hidden="true"
            className="rounded-sm bg-primary px-1.5 py-0.5 text-sm text-primary-foreground lg:hidden lg:group-data-collapsed:inline"
          >
            LO
          </span>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="hidden shrink-0 lg:inline-flex lg:group-data-collapsed:hidden"
          aria-label={messages.nav.collapse}
          onClick={() => setCollapsed(true)}
        >
          <PanelLeftCloseIcon aria-hidden="true" />
        </Button>
      </div>
      {collapsed ? (
        <div className="hidden px-3 pb-2 lg:flex lg:justify-center">
          <Button
            variant="ghost"
            size="icon"
            aria-label={messages.nav.expand}
            onClick={() => setCollapsed(false)}
          >
            <PanelLeftOpenIcon aria-hidden="true" />
          </Button>
        </div>
      ) : null}

      <nav aria-label={messages.nav.primary} className="flex-1 overflow-y-auto px-2 py-2">
        {sections.map((section) => (
          <div key={section.key} className="flex flex-col gap-1">
            {section.heading ? (
              <div className="px-3 pt-3 pb-1">
                <span
                  className={cn(
                    "text-xs font-semibold tracking-wide text-muted-foreground uppercase",
                    labelClassName,
                  )}
                >
                  {section.heading}
                </span>
                <Separator className="lg:hidden lg:group-data-collapsed:block" />
              </div>
            ) : null}
            <ul className="flex flex-col gap-1">
              {section.items.map((item) => {
                const isNotifications = item.href === "/notificacoes";
                return (
                  <li key={item.href}>
                    <NavLink
                      item={item}
                      title={item.label}
                      labelClassName={labelClassName}
                      className="max-lg:justify-center max-lg:px-0 lg:group-data-collapsed:justify-center lg:group-data-collapsed:px-0"
                      count={isNotifications ? unreadNotifications : undefined}
                      countLabel={
                        isNotifications ? messages.header.unread(unreadNotifications) : undefined
                      }
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="flex flex-col gap-3 border-t px-3 py-3 max-lg:items-center lg:px-4 lg:group-data-collapsed:items-center">
        <AutonomyIndicator labelClassName={labelClassName} />
        <LinkedInStatus status={linkedInStatus} labelClassName={labelClassName} />
        <Link
          href="/configuracoes"
          title={accountName}
          className="flex min-h-11 items-center gap-2 rounded-md text-sm font-medium leading-5 hover:bg-secondary lg:px-1"
        >
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary">
            <UserRoundIcon aria-hidden="true" className="size-4" />
          </span>
          <span className={cn("truncate", labelClassName)}>{accountName}</span>
          <span className="sr-only">
            {messages.header.account}. {messages.header.openSettings}
          </span>
        </Link>
      </div>
    </aside>
  );
}
