"use client";

import type { AutonomyMode } from "@linkedin-ops/ui";
import { createContext, type ReactNode, useContext } from "react";

/**
 * Exposes the current autonomy mode to the shell. The value is **mocked** until the settings API
 * exists (T-044/T-045); the frontend never decides or changes the mode on its own.
 */
export type AutonomyModeContextValue = {
  mode: AutonomyMode;
  /** Where the value came from; `mock` until the API is wired. */
  source: "mock" | "api";
};

const DEFAULT_VALUE: AutonomyModeContextValue = { mode: "ASSISTED", source: "mock" };

const AutonomyModeContext = createContext<AutonomyModeContextValue>(DEFAULT_VALUE);

export function AutonomyModeProvider({
  value = DEFAULT_VALUE,
  children,
}: {
  value?: AutonomyModeContextValue;
  children: ReactNode;
}) {
  return <AutonomyModeContext.Provider value={value}>{children}</AutonomyModeContext.Provider>;
}

export function useAutonomyMode(): AutonomyModeContextValue {
  return useContext(AutonomyModeContext);
}
