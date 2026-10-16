import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";

export type EmptyStateProps = Omit<ComponentProps<"section">, "title"> & {
  /** Heading of the empty state (screen-states.md: "Empty não é erro"). */
  title: string;
  /** Why there is no data and what happens next. */
  description?: ReactNode;
  /** Optional decorative icon (rendered `aria-hidden`). */
  icon?: ReactNode;
  /** Next possible action(s), usually a `Button`. */
  actions?: ReactNode;
  /** Heading level for the title; defaults to `h2` (page `h1` belongs to the page header). */
  headingLevel?: "h2" | "h3";
};

export function EmptyState({
  title,
  description,
  icon,
  actions,
  headingLevel: Heading = "h2",
  className,
  ...props
}: EmptyStateProps) {
  return (
    <section
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center gap-3 rounded-md border border-dashed bg-card px-4 py-10 text-center sm:px-6",
        className,
      )}
      {...props}
    >
      {icon ? (
        <span aria-hidden="true" className="text-muted-foreground [&>svg]:size-6">
          {icon}
        </span>
      ) : null}
      <Heading className="text-lg font-semibold leading-7">{title}</Heading>
      {description ? (
        <div className="max-w-prose text-sm leading-6 text-muted-foreground">{description}</div>
      ) : null}
      {actions ? <div className="mt-2 flex flex-wrap justify-center gap-2">{actions}</div> : null}
    </section>
  );
}
