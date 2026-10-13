"use client";

import { Button } from "@linkedin-ops/ui";
import { ArrowLeftIcon, BellIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { messages, notificationsLabel } from "@/i18n/pt-br";

/**
 * Mobile top bar: back control on nested routes, app name and the notifications bell.
 * The screen title itself is the page `h1` rendered right below (one `h1` per route).
 */
export function MobileTopBar({ unreadNotifications }: { unreadNotifications: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const nested = pathname.split("/").filter(Boolean).length > 1;

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-card px-2 md:hidden">
      {nested ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={messages.nav.back}
          onClick={() => router.back()}
        >
          <ArrowLeftIcon aria-hidden="true" />
        </Button>
      ) : null}
      <Link href="/hoje" className="min-w-0 flex-1 truncate px-2 text-base font-bold leading-6">
        {messages.app.name}
      </Link>
      <Button asChild variant="ghost" size="icon">
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
