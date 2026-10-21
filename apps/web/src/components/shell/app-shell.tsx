"use client";

import type { ReactNode } from "react";
import { MOCK_UNREAD_NOTIFICATIONS, linkedInStatusFromSession } from "@/config/mock";
import { useAuth } from "@/providers/auth-provider";
import { BottomNav } from "./bottom-nav";
import { MobileTopBar } from "./mobile-top-bar";
import { RouteFocus } from "./route-focus";
import { Sidebar } from "./sidebar";
import { MAIN_CONTENT_ID, SkipLink } from "./skip-link";

/**
 * Application shell: skip link → sidebar (md+) / top bar + bottom nav (mobile) → `main`.
 * DOM order matches reading order; the page header and `h1` are rendered by each page inside `main`.
 * Account name and LinkedIn status come from the session (`GET /auth/me`); the shell is only rendered
 * behind `RequireSession`, so `user` is present.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const accountName = user?.name ?? "";
  const linkedInStatus = linkedInStatusFromSession(user?.linkedinConnected ?? false);
  return (
    <>
      <SkipLink />
      <RouteFocus />
      <div className="flex min-h-dvh">
        <Sidebar
          linkedInStatus={linkedInStatus}
          unreadNotifications={MOCK_UNREAD_NOTIFICATIONS}
          accountName={accountName}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <MobileTopBar unreadNotifications={MOCK_UNREAD_NOTIFICATIONS} />
          <main
            id={MAIN_CONTENT_ID}
            tabIndex={-1}
            className="flex-1 px-4 pb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+1rem)] outline-none sm:px-6 md:pb-8 lg:px-8"
          >
            <div className="mx-auto w-full max-w-[96rem]">{children}</div>
          </main>
        </div>
      </div>
      <BottomNav linkedInStatus={linkedInStatus} unreadNotifications={MOCK_UNREAD_NOTIFICATIONS} />
    </>
  );
}
