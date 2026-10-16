"use client";

import { Tooltip, TooltipContent, TooltipTrigger, cn } from "@linkedin-ops/ui";
import { CircleAlertIcon, CircleCheckIcon, CircleXIcon } from "lucide-react";
import Link from "next/link";
import type { LinkedInConnectionStatus } from "@/config/mock";
import { messages } from "@/i18n/pt-br";

const PRESENTATION = {
  CONNECTED: { icon: CircleCheckIcon, className: "text-success" },
  ATTENTION: { icon: CircleAlertIcon, className: "text-warning-foreground" },
  DISCONNECTED: { icon: CircleXIcon, className: "text-destructive" },
} as const;

export type LinkedInStatusProps = {
  status: LinkedInConnectionStatus;
  /** Extra classes for the text (e.g. `sr-only` in icon-only rails). */
  labelClassName?: string;
  /** Classes for the tooltip; pass `hidden` when the label is visible to avoid a redundant tooltip. */
  tooltipClassName?: string;
  className?: string;
};

/**
 * "LinkedIn: Conectado" — icon + text, colour as support only. Links to the integrations settings so it is
 * focusable; icon-only rails get a real tooltip (hover + focus, Escape closes).
 */
export function LinkedInStatus({
  status,
  labelClassName,
  tooltipClassName,
  className,
}: LinkedInStatusProps) {
  const { icon: Icon, className: tone } = PRESENTATION[status];
  const label = `${messages.linkedin.label}: ${messages.linkedin.status[status]}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href="/configuracoes"
          data-slot="linkedin-status"
          data-status={status}
          className={cn(
            "inline-flex min-h-8 items-center gap-2 rounded-sm text-sm leading-5 hover:underline",
            className,
          )}
        >
          <Icon aria-hidden="true" className={cn("size-4 shrink-0", tone)} />
          <span className={labelClassName}>{label}</span>
          <span className="sr-only">. {messages.linkedin.openSettings}</span>
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right" className={tooltipClassName}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
