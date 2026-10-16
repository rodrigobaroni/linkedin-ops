"use client";

import {
  AUTONOMY_MODE_PRESENTATION,
  AutonomyModeBadge,
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn,
} from "@linkedin-ops/ui";
import Link from "next/link";
import { messages } from "@/i18n/pt-br";
import { useAutonomyMode } from "@/providers/autonomy-mode-provider";

export type AutonomyIndicatorProps = {
  /** Extra classes for the badge text (e.g. `sr-only` in icon-only rails; the name stays accessible). */
  labelClassName?: string;
  className?: string;
  /** Popover placement relative to the trigger. */
  side?: "top" | "right" | "bottom" | "left";
};

/**
 * Always-visible autonomy badge fed by the provider (mocked until the settings API lands). The badge is
 * a button that opens "Entender o modo": the explanation is reachable by keyboard and touch, not only by
 * hover (Aurora P1 on PR #67). Nothing here decides or changes the mode.
 */
export function AutonomyIndicator({
  labelClassName,
  className,
  side = "bottom",
}: AutonomyIndicatorProps) {
  const { mode, cancelWindowMinutes, mediaRequiresHuman } = useAutonomyMode();
  const { shortMessage } = AUTONOMY_MODE_PRESENTATION[mode];

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "inline-flex rounded-sm transition-colors duration-fast hover:opacity-90 focus-visible:outline-2",
          className,
        )}
      >
        <AutonomyModeBadge
          mode={mode}
          prefix={messages.autonomy.prefix}
          labelClassName={labelClassName}
        />
        <span className="sr-only">. {messages.autonomy.learnMore}</span>
      </PopoverTrigger>
      <PopoverContent side={side} aria-label={messages.autonomy.learnMore}>
        <div className="flex flex-col gap-2">
          <p className="font-semibold">
            {messages.autonomy.prefix} {messages.autonomy.fullName[mode]}
          </p>
          <p>{shortMessage}</p>
          {mode === "AUTOPILOT_CONTROLLED" ? (
            <p>{messages.autonomy.cancelWindow(cancelWindowMinutes)}</p>
          ) : null}
          {mode === "AUTOPILOT_FULL" ? <p>{messages.autonomy.noCancelWindow}</p> : null}
          {mediaRequiresHuman ? <p>{messages.autonomy.mediaRequiresHuman}</p> : null}
          <Link
            href="/configuracoes"
            className="font-medium text-primary underline underline-offset-4"
          >
            {messages.autonomy.settingsLink}
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
