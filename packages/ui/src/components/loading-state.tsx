import type { ComponentProps } from "react";
import { cn } from "../lib/cn.js";
import { Skeleton } from "./skeleton.js";

export type LoadingStateProps = ComponentProps<"div"> & {
  /** Text announced to assistive technology and available as a static alternative to the animation. */
  label?: string;
  /** Number of skeleton blocks mirroring the expected content geometry. */
  blocks?: number;
};

/**
 * Loading preserves context: skeletons with the same geometry as the content, never a full-page spinner
 * (screen-states.md "Regras comuns"). `role="status"` announces politely without stealing focus.
 */
export function LoadingState({
  label = "Carregando",
  blocks = 3,
  className,
  ...props
}: LoadingStateProps) {
  return (
    <div
      data-slot="loading-state"
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn("flex flex-col gap-4", className)}
      {...props}
    >
      <span className="sr-only">{label}…</span>
      {Array.from({ length: blocks }, (_, index) => (
        <div key={index} className="flex flex-col gap-3 rounded-md border bg-card p-5">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      ))}
    </div>
  );
}
