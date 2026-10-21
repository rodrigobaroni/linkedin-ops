import { LoaderCircleIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

/**
 * Decorative busy indicator for buttons and inline states. Always `aria-hidden`: the surrounding text
 * ("Entrando…") or a `role="status"` region carries the meaning (accessibility.md "Loading").
 */
export function Spinner({ className, ...props }: ComponentProps<"svg">) {
  return (
    <LoaderCircleIcon
      data-slot="spinner"
      aria-hidden="true"
      focusable="false"
      className={cn("size-4 animate-spin motion-reduce:animate-none", className)}
      {...props}
    />
  );
}
