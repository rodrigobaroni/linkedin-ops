import { cn } from "@linkedin-ops/ui";
import { CircleAlertIcon, CircleCheckIcon, CircleXIcon } from "lucide-react";
import type { LinkedInConnectionStatus } from "@/config/mock";
import { messages } from "@/i18n/pt-br";

const PRESENTATION = {
  CONNECTED: { icon: CircleCheckIcon, className: "text-success" },
  ATTENTION: { icon: CircleAlertIcon, className: "text-warning-foreground" },
  DISCONNECTED: { icon: CircleXIcon, className: "text-destructive" },
} as const;

/** "LinkedIn: Conectado" line for the sidebar/drawer — icon + text, colour as support only. */
export function LinkedInStatus({
  status,
  labelClassName,
  className,
}: {
  status: LinkedInConnectionStatus;
  labelClassName?: string;
  className?: string;
}) {
  const { icon: Icon, className: tone } = PRESENTATION[status];
  const label = `${messages.linkedin.label}: ${messages.linkedin.status[status]}`;
  return (
    <span
      data-slot="linkedin-status"
      data-status={status}
      title={label}
      className={cn("inline-flex items-center gap-2 text-sm leading-5", className)}
    >
      <Icon aria-hidden="true" className={cn("size-4 shrink-0", tone)} />
      <span className={labelClassName}>{label}</span>
    </span>
  );
}
