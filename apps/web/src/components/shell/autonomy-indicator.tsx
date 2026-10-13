"use client";

import { AutonomyModeBadge, type AutonomyModeBadgeProps } from "@linkedin-ops/ui";
import { messages } from "@/i18n/pt-br";
import { useAutonomyMode } from "@/providers/autonomy-mode-provider";

/** Always-visible autonomy badge fed by the provider (mocked until the settings API lands). */
export function AutonomyIndicator(props: Omit<AutonomyModeBadgeProps, "mode" | "prefix">) {
  const { mode } = useAutonomyMode();
  return <AutonomyModeBadge mode={mode} prefix={messages.autonomy.prefix} {...props} />;
}
