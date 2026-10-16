"use client";

import type { LinkedInConnectionStatus } from "@/config/mock";
import { bottomNavHrefs, navItems } from "@/config/navigation";
import { messages } from "@/i18n/pt-br";
import { MoreDrawer } from "./more-drawer";
import { NavLink } from "./nav-link";

export type BottomNavProps = {
  linkedInStatus: LinkedInConnectionStatus;
  unreadNotifications: number;
};

const ITEM_CLASS =
  "flex h-full min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-md px-1 py-1 text-xs font-medium leading-4 hover:bg-secondary";

/** Mobile (< 768 px) bottom bar: Hoje, Curadoria, Calendário and "Mais", labels always visible. */
export function BottomNav({ linkedInStatus, unreadNotifications }: BottomNavProps) {
  const items = bottomNavHrefs.map((href) => navItems.find((item) => item.href === href)!);

  return (
    <nav
      aria-label={messages.nav.bottom}
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex h-bottom-nav items-stretch gap-1 px-2 py-1">
        {items.map((item) => (
          <li key={item.href} className="flex flex-1">
            <NavLink item={item} className={ITEM_CLASS} />
          </li>
        ))}
        <li className="flex flex-1">
          <MoreDrawer
            linkedInStatus={linkedInStatus}
            unreadNotifications={unreadNotifications}
            triggerClassName={`${ITEM_CLASS} w-full aria-[current=true]:bg-accent aria-[current=true]:font-semibold aria-[current=true]:text-accent-foreground`}
          />
        </li>
      </ul>
    </nav>
  );
}
