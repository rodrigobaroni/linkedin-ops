import type { ComponentProps } from "react";
import { cn } from "../lib/cn.js";

export type SeparatorProps = ComponentProps<"div"> & {
  orientation?: "horizontal" | "vertical";
  /** Decorative separators are hidden from assistive technology (default). */
  decorative?: boolean;
};

export function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: SeparatorProps) {
  return (
    <div
      data-slot="separator"
      role={decorative ? "none" : "separator"}
      aria-orientation={decorative ? undefined : orientation}
      className={cn(
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      {...props}
    />
  );
}
