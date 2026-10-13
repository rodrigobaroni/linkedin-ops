import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
} from "@linkedin-ops/ui";
import { BellIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { AutonomyIndicator } from "./autonomy-indicator";
import { notificationsLabel } from "./mobile-top-bar";

export type PageHeaderProps = {
  title: string;
  description?: ReactNode;
  /** Breadcrumb trail above the title; the current page is appended automatically. */
  breadcrumb?: { label: string; href: Route }[];
  /** Screen actions (buttons/links) rendered on the right. */
  actions?: ReactNode;
  unreadNotifications?: number;
  /** Extra line under the title, e.g. an item id. */
  meta?: ReactNode;
};

/**
 * Contextual header: breadcrumb, `h1` (focus target after navigation), description, actions and the
 * autonomy badge, which stays visible on every screen (screen-states.md "Padrão global").
 */
export function PageHeader({
  title,
  description,
  breadcrumb = [],
  actions,
  unreadNotifications = 0,
  meta,
}: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-3 py-4 md:py-6">
      <div className="flex items-start justify-between gap-4">
        <Breadcrumb>
          <BreadcrumbList>
            {breadcrumb.map((entry) => (
              <BreadcrumbItemWithSeparator key={entry.href} label={entry.label} href={entry.href} />
            ))}
            <BreadcrumbItem>
              <BreadcrumbPage>{title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <Button asChild variant="ghost" size="icon" className="relative hidden md:inline-flex">
          <Link href="/notificacoes" aria-label={notificationsLabel(unreadNotifications)}>
            <BellIcon aria-hidden="true" />
            {unreadNotifications > 0 ? (
              <span
                aria-hidden="true"
                className="absolute top-1 right-1 inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground"
              >
                {unreadNotifications}
              </span>
            ) : null}
          </Link>
        </Button>
      </div>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1
              tabIndex={-1}
              className="text-2xl font-bold leading-8 outline-none focus-visible:outline-2"
            >
              {title}
            </h1>
            <AutonomyIndicator />
          </div>
          {description ? (
            <p className="max-w-prose text-sm leading-6 text-muted-foreground">{description}</p>
          ) : null}
          {meta ? <div className="text-sm leading-6 text-muted-foreground">{meta}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2 md:justify-end">{actions}</div> : null}
      </div>
    </header>
  );
}

function BreadcrumbItemWithSeparator({ label, href }: { label: string; href: Route }) {
  return (
    <>
      <BreadcrumbItem>
        <BreadcrumbLink asChild>
          <Link href={href}>{label}</Link>
        </BreadcrumbLink>
      </BreadcrumbItem>
      <BreadcrumbSeparator />
    </>
  );
}
