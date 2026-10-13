"use client";

import { cn } from "@linkedin-ops/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";
import { isActivePath, type NavItem } from "@/config/navigation";

export type NavLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  item: NavItem;
  /** Extra classes for the label (e.g. `sr-only` at some breakpoints for icon-only rails). */
  labelClassName?: string;
  /** Optional count rendered as a badge next to the label (e.g. unread notifications). */
  count?: number;
  countLabel?: string;
};

/** Link with `aria-current="page"` for the active route; the active style never relies on colour alone. */
export function NavLink({
  item,
  labelClassName,
  count,
  countLabel,
  className,
  ...props
}: NavLinkProps) {
  const pathname = usePathname();
  const active = isActivePath(pathname, item.href);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium leading-5 text-foreground transition-colors duration-fast hover:bg-secondary",
        "aria-[current=page]:bg-accent aria-[current=page]:font-semibold aria-[current=page]:text-accent-foreground",
        className,
      )}
      {...props}
    >
      <Icon aria-hidden="true" className="size-5 shrink-0" />
      <span className={cn("truncate", labelClassName)}>{item.label}</span>
      {count && count > 0 ? (
        <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold leading-4 text-primary-foreground">
          {count}
          {countLabel ? <span className="sr-only"> {countLabel}</span> : null}
        </span>
      ) : null}
    </Link>
  );
}
