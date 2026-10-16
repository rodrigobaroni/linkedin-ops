import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

/** Inline alert / page banner. Severity follows screen-states.md "Severidade de feedback". */
const alertVariants = cva(
  "relative grid w-full grid-cols-[0_1fr] items-start gap-y-1 rounded-md border px-4 py-3 text-sm leading-6 has-[>svg]:grid-cols-[calc(var(--spacing)*5)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-5 [&>svg]:translate-y-0.5",
  {
    variants: {
      variant: {
        info: "border-info/30 bg-info-subtle text-info-foreground [&>svg]:text-info",
        success: "border-success/30 bg-success-subtle text-success [&>svg]:text-success",
        warning:
          "border-warning/40 bg-warning-subtle text-warning-foreground [&>svg]:text-warning-foreground",
        destructive:
          "border-destructive/30 bg-destructive/10 text-destructive [&>svg]:text-destructive",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  },
);

export type AlertProps = ComponentProps<"div"> & VariantProps<typeof alertVariants>;

export function Alert({ className, variant, role, ...props }: AlertProps) {
  return (
    <div
      data-slot="alert"
      // `role="alert"` only for urgent errors (accessibility.md 1.3.1); callers may pass `role="status"`.
      role={role ?? (variant === "destructive" ? "alert" : "status")}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

export function AlertTitle({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="alert-title"
      className={cn("col-start-2 font-semibold leading-6", className)}
      {...props}
    />
  );
}

export function AlertDescription({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn("col-start-2 grid gap-1 [&_p]:leading-6", className)}
      {...props}
    />
  );
}
