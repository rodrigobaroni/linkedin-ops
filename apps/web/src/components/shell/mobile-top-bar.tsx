"use client";

import { Button } from "@linkedin-ops/ui";
import { ArrowLeftIcon, BellIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import { messages, notificationsLabel } from "@/i18n/pt-br";

/**
 * Mobile top bar: back control on nested routes, app name and the notifications bell.
 * The screen title itself is the page `h1` rendered right below (one `h1` per route).
 * "Voltar" always lands inside the app (parent route), even when the page was opened from a deep link;
 * returning to the recorded origin (navigation-map.md) arrives with the Estúdio epic.
 */
export function MobileTopBar({ unreadNotifications }: { unreadNotifications: number }) {
  const pathname = usePathname();
  const parent = parentRoute(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-card px-2 md:hidden">
      {parent ? (
        <Button asChild variant="ghost" size="icon">
          <Link href={parent} aria-label={messages.nav.back}>
            <ArrowLeftIcon aria-hidden="true" />
          </Link>
        </Button>
      ) : null}
      <Link href="/hoje" className="min-w-0 flex-1 truncate px-2 text-base font-bold leading-6">
        {messages.app.name}
      </Link>
      <Button asChild variant="ghost" size="icon" className="relative">
        <Link href="/notificacoes" aria-label={notificationsLabel(unreadNotifications)}>
          <BellIcon aria-hidden="true" />
          {unreadNotifications > 0 ? (
            <span
              aria-hidden="true"
              className="absolute top-1.5 right-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground"
            >
              {unreadNotifications}
            </span>
          ) : null}
        </Link>
      </Button>
    </header>
  );
}

/** `/estudio/abc` → `/estudio`; top-level routes have no parent. */
export function parentRoute(pathname: string): Route | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length < 2) return null;
  return `/${segments.slice(0, -1).join("/")}` as Route;
}
