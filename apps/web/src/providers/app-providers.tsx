"use client";

import { TooltipProvider } from "@linkedin-ops/ui";
import type { ReactNode } from "react";
import { AuthProvider } from "./auth-provider";
import { AutonomyModeProvider } from "./autonomy-mode-provider";
import { QueryProvider } from "./query-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <AuthProvider>
        <AutonomyModeProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </AutonomyModeProvider>
      </AuthProvider>
    </QueryProvider>
  );
}
