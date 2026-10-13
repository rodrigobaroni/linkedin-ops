import { AlertCircleIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn.js";

export type ErrorStateProps = Omit<ComponentProps<"section">, "title"> & {
  /** Plain-language title, e.g. "Não foi possível carregar o histórico". */
  title: string;
  /** What was preserved and what the user can do. */
  description?: ReactNode;
  /** Recovery action(s), usually a `Tentar novamente` button. */
  actions?: ReactNode;
  /** Support correlation id, shown collapsed under "Detalhes para suporte". Never a secret. */
  correlationId?: string;
  headingLevel?: "h2" | "h3";
};

/** Error explains and recovers (screen-states.md). Announced once as an alert; focus is not moved. */
export function ErrorState({
  title,
  description,
  actions,
  correlationId,
  headingLevel: Heading = "h2",
  className,
  ...props
}: ErrorStateProps) {
  return (
    <section
      data-slot="error-state"
      role="alert"
      className={cn(
        "flex flex-col gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-6 sm:px-6",
        className,
      )}
      {...props}
    >
      <div className="flex items-start gap-3">
        <AlertCircleIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-destructive" />
        <div className="flex flex-col gap-1">
          <Heading className="text-lg font-semibold leading-7 text-destructive">{title}</Heading>
          {description ? (
            <div className="max-w-prose text-sm leading-6 text-foreground">{description}</div>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap gap-2 pl-8">{actions}</div> : null}
      {correlationId ? (
        <details className="pl-8 text-sm leading-6 text-muted-foreground">
          <summary className="cursor-pointer font-medium">Detalhes para suporte</summary>
          <p className="mt-1">
            Código de referência: <code className="font-mono text-xs">{correlationId}</code>
          </p>
        </details>
      ) : null}
    </section>
  );
}
