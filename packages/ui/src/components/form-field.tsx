import { type ReactNode, useId } from "react";
import { cn } from "../lib/cn";
import { Label } from "./label";

export type FormFieldControlProps = {
  id: string;
  "aria-describedby": string | undefined;
  "aria-invalid": true | undefined;
  "aria-required": true | undefined;
};

export type FormFieldProps = {
  label: ReactNode;
  /** Help text, rendered before the error (design-tokens.md "Formulários"). */
  description?: ReactNode;
  /** Validation message; when present the control is marked `aria-invalid` and described by it. */
  error?: ReactNode;
  required?: boolean;
  /** Suffix explaining the required marker, e.g. "obrigatório"; shown once per form by the caller. */
  requiredLabel?: string;
  /** Explicit id for the control (defaults to a generated one). */
  id?: string;
  className?: string;
  /** Render prop receiving the accessibility wiring to spread on the control. */
  children: (control: FormFieldControlProps) => ReactNode;
};

/**
 * Label + control + help + error, wired with `aria-describedby`/`aria-invalid` (accessibility.md 3.3.1,
 * design-tokens.md "Formulários"). The error is a plain paragraph: the form announces submission errors
 * once in its own alert region instead of one live region per field.
 */
export function FormField({
  label,
  description,
  error,
  required,
  requiredLabel = "obrigatório",
  id: explicitId,
  className,
  children,
}: FormFieldProps) {
  const generatedId = useId();
  const id = explicitId ?? generatedId;
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const describedBy =
    [description ? descriptionId : null, error ? errorId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div data-slot="form-field" className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? (
          <>
            {" "}
            <span aria-hidden="true" className="text-destructive">
              *
            </span>
            <span className="sr-only"> ({requiredLabel})</span>
          </>
        ) : null}
      </Label>
      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
        "aria-required": required ? true : undefined,
      })}
      {description ? (
        <p id={descriptionId} className="text-sm leading-5 text-muted-foreground">
          {description}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} data-slot="form-field-error" className="text-sm leading-5 text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
