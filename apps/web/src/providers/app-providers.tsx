"use client";

import type { ReactNode } from "react";
import { AutonomyModeProvider } from "./autonomy-mode-provider";
import { QueryProvider } from "./query-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <AutonomyModeProvider>{children}</AutonomyModeProvider>
    </QueryProvider>
  );
}
