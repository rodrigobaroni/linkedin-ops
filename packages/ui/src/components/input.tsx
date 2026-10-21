import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

export type InputProps = ComponentProps<"input">;

/**
 * Text input (design-tokens.md "Formulários"): 40 px tall, `border-strong`, visible focus ring. Invalid
 * state is driven by `aria-invalid`, which the `FormField` wrapper sets from the error message.
 */
export function Input({ className, type = "text", ...props }: InputProps) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-10 w-full min-w-0 rounded-md border border-border-strong bg-card px-3 py-2 text-base leading-6 text-foreground shadow-xs transition-colors duration-fast placeholder:text-muted-foreground md:text-sm md:leading-5",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive",
        className,
      )}
      {...props}
    />
  );
}
