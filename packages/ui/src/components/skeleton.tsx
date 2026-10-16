import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

/** Skeleton block; pulse animation is disabled under `prefers-reduced-motion` (design-tokens.md). */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("rounded-md bg-secondary motion-safe:animate-pulse", className)}
      {...props}
    />
  );
}
