"use client";

import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "../lib/cn";
import { Input, type InputProps } from "./input";

export type PasswordInputProps = Omit<InputProps, "type"> & {
  /** Accessible name of the toggle while the password is hidden (PT-BR by default). */
  showLabel?: string;
  /** Accessible name of the toggle while the password is visible. */
  hideLabel?: string;
};

/**
 * Password field with a show/hide toggle whose accessible name follows its state. The toggle is a
 * plain button (not `aria-pressed`) so the name alone tells what it will do; it is 44 px wide to meet
 * the mobile target size, and never submits the form.
 */
export function PasswordInput({
  className,
  showLabel = "Mostrar senha",
  hideLabel = "Ocultar senha",
  disabled,
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div data-slot="password-input" className="relative">
      <Input
        type={visible ? "text" : "password"}
        className={cn("pr-12", className)}
        disabled={disabled}
        {...props}
      />
      <button
        type="button"
        className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        aria-label={visible ? hideLabel : showLabel}
        disabled={disabled}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? (
          <EyeOffIcon className="size-5" aria-hidden="true" />
        ) : (
          <EyeIcon className="size-5" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
