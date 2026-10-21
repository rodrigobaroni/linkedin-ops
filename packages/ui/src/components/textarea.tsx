import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

export type TextareaProps = ComponentProps<"textarea">;

/** Multi-line text field; same border, focus and invalid treatment as `Input`. */
export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-40 w-full min-w-0 rounded-md border border-border-strong bg-card px-3 py-2 text-base leading-6 text-foreground shadow-xs transition-colors duration-fast placeholder:text-muted-foreground md:text-sm md:leading-6",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive",
        className,
      )}
      {...props}
    />
  );
}
