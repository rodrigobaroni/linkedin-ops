"use client";

import type { AutonomyMode } from "@linkedin-ops/ui";
import { createContext, type ReactNode, useContext } from "react";

/**
 * Exposes the current autonomy settings to the shell. Values are **mocked** until the settings API
 * exists (`GET /settings/autonomy`, T-044/T-045); the frontend never decides or changes them.
 * Field names mirror `AutonomySettings` in docs/architecture/contracts.md §3.4.
 */
export type AutonomyModeContextValue = {
  mode: AutonomyMode;
  /** Minutes between the Telegram notification and publishing in AUTOPILOT_CONTROLLED (default 60). */
  cancelWindowMinutes: number;
  /** Media always needs a human approval while this is true (default, every mode). */
  mediaRequiresHuman: boolean;
  /** Where the value came from; `mock` until the API is wired. */
  source: "mock" | "api";
};

const DEFAULT_VALUE: AutonomyModeContextValue = {
  mode: "ASSISTED",
  cancelWindowMinutes: 60,
  mediaRequiresHuman: true,
  source: "mock",
};

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
