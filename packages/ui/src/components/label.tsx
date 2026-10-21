"use client";

import { Label as LabelPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

export type LabelProps = ComponentProps<typeof LabelPrimitive.Root>;

/** Always visible label (design-tokens.md "Formulários": placeholder is an example, never the label). */
export function Label({ className, ...props }: LabelProps) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "text-sm font-medium leading-5 text-foreground select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
