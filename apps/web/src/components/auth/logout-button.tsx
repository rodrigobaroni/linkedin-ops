"use client";

import { Button, type ButtonProps, cn } from "@linkedin-ops/ui";
import { LogOutIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { messages } from "@/i18n/pt-br";
import { LOGIN_PATH } from "@/lib/next-path";
import { useAuth } from "@/providers/auth-provider";

export type LogoutButtonProps = Omit<ButtonProps, "children"> & {
  /** Classes for the text label (e.g. `sr-only` in icon-only rails). */
  labelClassName?: string;
};

/** `POST /auth/logout` then `/login`. The local session is dropped even when the API call fails. */
export function LogoutButton({
  labelClassName,
  className,
  variant = "ghost",
  onClick,
  ...props
}: LogoutButtonProps) {
  const { logout } = useAuth();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      await logout();
    } finally {
      router.replace(LOGIN_PATH);
    }
  }

  return (
    <Button
      variant={variant}
      className={cn("justify-start", className)}
      disabled={pending}
      aria-busy={pending || undefined}
      {...props}
      onClick={(event) => {
        // Composed so an `asChild` parent (e.g. `TooltipTrigger`) keeps its own handler.
        onClick?.(event);
        if (!event.defaultPrevented) void handleClick();
      }}
    >
      <LogOutIcon aria-hidden="true" />
      <span className={labelClassName}>
        {pending ? messages.auth.session.loggingOut : messages.auth.session.logout}
      </span>
    </Button>
  );
}
