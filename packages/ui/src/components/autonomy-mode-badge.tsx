import { cva, type VariantProps } from "class-variance-authority";
import { CircleDotIcon, CircleDotDashedIcon, DiamondIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "../lib/cn";
import type { AutonomyMode } from "../types/autonomy";

/**
 * Presentation of the autonomy mode: badge labels, icons and short messages from the ratified
 * screen-states.md ("Aparência do modo de autonomia", T-013 revision, aligned with data-model.md §2.1):
 * ASSISTED = you approve every step; AUTOPILOT_CONTROLLED = the system approves and schedules, you can
 * cancel before the deadline (`cancel_window_minutes`, default 60); AUTOPILOT_FULL = no cancel window.
 * Icon + textual label; colour is support only. The component receives the mode — it never decides it.
 */
export const AUTONOMY_MODE_PRESENTATION: Record<
  AutonomyMode,
  { label: string; shortMessage: string; symbol: string }
> = {
  ASSISTED: {
    label: "Assistido",
    shortMessage: "Você aprova todas as etapas.",
    symbol: "◉",
  },
  AUTOPILOT_CONTROLLED: {
    label: "Controlado",
    shortMessage: "O sistema aprova e agenda; você pode cancelar antes do prazo.",
    symbol: "◐",
  },
  AUTOPILOT_FULL: {
    label: "Completo",
    shortMessage: "O sistema aprova e agenda sem janela de cancelamento.",
    symbol: "◆",
  },
};

const autonomyModeBadgeVariants = cva(
  "inline-flex w-fit items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-medium leading-4 [&>svg]:size-3.5 [&>svg]:shrink-0",
  {
    variants: {
      autonomyMode: {
        ASSISTED: "border-transparent bg-info-subtle text-info-foreground",
        AUTOPILOT_CONTROLLED: "border-transparent bg-warning-subtle text-warning-foreground",
        AUTOPILOT_FULL: "border-transparent bg-automation-subtle text-automation-foreground",
      },
    },
    defaultVariants: {
      autonomyMode: "ASSISTED",
    },
  },
);

const ICONS = {
  ASSISTED: CircleDotIcon,
  AUTOPILOT_CONTROLLED: CircleDotDashedIcon,
  AUTOPILOT_FULL: DiamondIcon,
} satisfies Record<AutonomyMode, typeof CircleDotIcon>;

export type AutonomyModeBadgeProps = Omit<ComponentProps<"span">, "children"> &
  Omit<VariantProps<typeof autonomyModeBadgeVariants>, "autonomyMode"> & {
    mode: AutonomyMode;
    /** Prefix read by assistive technology and shown visually, e.g. "Modo". Omit for a bare label. */
    prefix?: string;
    /** Extra classes for the text (e.g. `sr-only` in icon-only rails; the label stays accessible). */
    labelClassName?: string;
  };

export function AutonomyModeBadge({
  mode,
  prefix,
  labelClassName,
  className,
  ...props
}: AutonomyModeBadgeProps) {
  const Icon = ICONS[mode];
  const { label } = AUTONOMY_MODE_PRESENTATION[mode];
  return (
    <span
      data-slot="autonomy-mode-badge"
      data-mode={mode}
      className={cn(autonomyModeBadgeVariants({ autonomyMode: mode }), className)}
      {...props}
    >
      <Icon aria-hidden="true" />
      <span className={labelClassName}>
        {prefix ? `${prefix} ` : null}
        {label}
      </span>
    </span>
  );
}

export { autonomyModeBadgeVariants };
