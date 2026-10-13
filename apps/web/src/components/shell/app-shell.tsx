import type { ReactNode } from "react";
import { MOCK_ACCOUNT_NAME, MOCK_LINKEDIN_STATUS, MOCK_UNREAD_NOTIFICATIONS } from "@/config/mock";
import { BottomNav } from "./bottom-nav";
import { MobileTopBar } from "./mobile-top-bar";
import { RouteFocus } from "./route-focus";
import { Sidebar } from "./sidebar";
import { MAIN_CONTENT_ID, SkipLink } from "./skip-link";

/**
 * Application shell: skip link → sidebar (md+) / top bar + bottom nav (mobile) → `main`.
 * DOM order matches reading order; the page header and `h1` are rendered by each page inside `main`.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <SkipLink />
      <RouteFocus />
      <div className="flex min-h-dvh">
        <Sidebar
          linkedInStatus={MOCK_LINKEDIN_STATUS}
          unreadNotifications={MOCK_UNREAD_NOTIFICATIONS}
          accountName={MOCK_ACCOUNT_NAME}
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
      <BottomNav
        linkedInStatus={MOCK_LINKEDIN_STATUS}
        unreadNotifications={MOCK_UNREAD_NOTIFICATIONS}
      />
    </>
  );
}
