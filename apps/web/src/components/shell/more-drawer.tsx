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
import type { LinkedInConnectionStatus } from "@/config/mock";
import { drawerItems, isActivePath, moreIcon as MoreIcon } from "@/config/navigation";
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
 * Mobile "Mais" drawer: remaining destinations plus the persistent autonomy line (navigation-map.md).
 * Each link is wrapped in `SheetClose`, so choosing a destination closes the drawer.
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
        <nav aria-label={messages.nav.more} className="overflow-y-auto px-2 pb-4">
          <ul className="flex flex-col gap-1">
            {items.map((item) => {
              const isNotifications = item.href === "/notificacoes";
              return (
                <li key={item.href}>
                  <SheetClose asChild>
                    <NavLink
                      item={item}
                      count={isNotifications ? unreadNotifications : undefined}
                      countLabel={
                        isNotifications ? messages.header.unread(unreadNotifications) : undefined
                      }
                    />
                  </SheetClose>
                </li>
              );
            })}
          </ul>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
