import { type ReactNode, Suspense } from "react";
import { RequireSession } from "@/components/auth/require-session";
import { AppShell } from "@/components/shell/app-shell";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    // Suspense: `RequireSession` reads the search params to preserve the destination across login.
    <Suspense fallback={null}>
      <RequireSession>
        <AppShell>{children}</AppShell>
      </RequireSession>
    </Suspense>
  );
}
