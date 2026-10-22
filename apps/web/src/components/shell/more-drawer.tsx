"use client";

import {
  Button,
  Separator,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  cn,
} from "@linkedin-ops/ui";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogoutButton } from "@/components/auth/logout-button";
import type { LinkedInConnectionStatus } from "@/config/mock";
import {
  drawerItems,
  isActivePath,
  moreIcon as MoreIcon,
  navGroupHeadings,
  navGroups,
} from "@/config/navigation";
import { messages } from "@/i18n/pt-br";
import { AutonomyIndicator } from "./autonomy-indicator";
import { LinkedInStatus } from "./linkedin-status";
import { NavLink } from "./nav-link";

export type MoreDrawerProps = {
  linkedInStatus: LinkedInConnectionStatus;
  unreadNotifications: number;
  /** Classes applied to the trigger button (shares the bottom-nav item style). */
  triggerClassName?: string;
};

/**
 * Mobile "Mais" drawer: remaining destinations, grouped like the sidebar ("Memória editorial", "Carreira"),
 * plus the persistent autonomy line (navigation-map.md). Each link is wrapped in `SheetClose`, so choosing a
 * destination closes the drawer.
 */
export function MoreDrawer({
  linkedInStatus,
  unreadNotifications,
  triggerClassName,
}: MoreDrawerProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const items = drawerItems();
  const containsActive = items.some((item) => isActivePath(pathname, item.href));
  const sections = navGroups
    .map((group) => ({
      key: group,
      heading: navGroupHeadings[group],
      items: items.filter((item) => item.group === group),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          aria-current={containsActive ? "true" : undefined}
          className={cn(triggerClassName)}
        >
          <MoreIcon aria-hidden="true" className="size-5" />
          <span>{messages.nav.more}</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="gap-0">
        <SheetHeader className="pr-14">
          <SheetTitle>{messages.nav.more}</SheetTitle>
          <SheetDescription>{messages.nav.moreDescription}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-2 px-4 pb-2">
          <AutonomyIndicator />
          <LinkedInStatus status={linkedInStatus} />
        </div>
        <Separator className="my-2" />
        <nav aria-label={messages.nav.more} className="min-h-0 overflow-y-auto px-2 pb-4">
          {sections.map((section) => (
            <div key={section.key} className="flex flex-col gap-1">
              {section.heading ? (
                <h3
                  id={`more-${section.key}`}
                  className="px-3 pt-3 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                >
                  {section.heading}
                </h3>
              ) : null}
              <ul
                aria-labelledby={section.heading ? `more-${section.key}` : undefined}
                className="flex flex-col gap-1"
              >
                {section.items.map((item) => {
                  const isNotifications = item.href === "/notificacoes";
                  return (
                    <li key={item.href}>
                      <SheetClose asChild>
                        <NavLink
                          item={item}
                          className="min-h-11"
                          count={isNotifications ? unreadNotifications : undefined}
                          countLabel={
                            isNotifications
                              ? messages.header.unread(unreadNotifications)
                              : undefined
                          }
                        />
                      </SheetClose>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <Separator />
        <div className="px-2 py-2 pb-4">
          <LogoutButton className="min-h-11 w-full" />
        </div>
      </SheetContent>
    </Sheet>
  );
}
