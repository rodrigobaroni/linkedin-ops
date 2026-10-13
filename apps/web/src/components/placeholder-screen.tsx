import { Button, EmptyState, ErrorState, LoadingState, cn } from "@linkedin-ops/ui";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { MOCK_UNREAD_NOTIFICATIONS } from "@/config/mock";
import { type ScreenKey, screens } from "@/config/screens";
import { messages } from "@/i18n/pt-br";
import { PageHeader } from "./shell/page-header";

/** `?estado=` values used to preview the standard states of a placeholder screen. */
export const SCREEN_STATES = ["vazio", "carregando", "erro"] as const;
export type ScreenState = (typeof SCREEN_STATES)[number];

const STATE_LABELS: Record<ScreenState, string> = {
  vazio: messages.states.empty,
  carregando: messages.states.loading,
  erro: messages.states.error,
};

export function parseScreenState(value: string | string[] | undefined): ScreenState {
  const candidate = Array.isArray(value) ? value[0] : value;
  return (SCREEN_STATES as readonly string[]).includes(candidate ?? "")
    ? (candidate as ScreenState)
    : "vazio";
}

export type PlaceholderScreenProps = {
  screen: ScreenKey;
  /** Current pathname, used to build the state-preview links. */
  pathname: Route;
  state?: ScreenState;
  /** Extra line under the title (e.g. an item id). */
  meta?: ReactNode;
};

/**
 * Placeholder page body: header + one of the standard states (empty by default). Functional content
 * replaces this component epic by epic; the state preview exists for visual QA (not for production use).
 */
export function PlaceholderScreen({
  screen,
  pathname,
  state = "vazio",
  meta,
}: PlaceholderScreenProps) {
  const definition = screens[screen];
  const breadcrumb: { label: string; href: Route }[] =
    screen === "hoje"
      ? []
      : [
          { label: messages.nav.home, href: "/hoje" },
          ...("parent" in definition && definition.parent ? [definition.parent] : []),
        ];

  return (
    <>
      <PageHeader
        title={definition.title}
        description={definition.description}
        breadcrumb={breadcrumb}
        unreadNotifications={MOCK_UNREAD_NOTIFICATIONS}
        meta={meta}
      />
      <StatePreviewNav pathname={pathname} current={state} />
      <div className="py-4">
        {state === "carregando" ? (
          <LoadingState label={`${messages.states.loadingLabel} ${definition.title}`} />
        ) : state === "erro" ? (
          <ErrorState
            title={messages.states.genericErrorTitle(definition.title)}
            description={messages.states.genericErrorDescription}
            correlationId="exemplo-0000"
            actions={
              <Button asChild variant="secondary">
                <Link href={pathname}>{messages.states.retry}</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            title={definition.empty.title}
            description={definition.empty.description}
            actions={
              "action" in definition.empty && definition.empty.action ? (
                <Button asChild>
                  <Link href={definition.empty.action.href}>{definition.empty.action.label}</Link>
                </Button>
              ) : undefined
            }
          />
        )}
      </div>
    </>
  );
}

/** Links to preview each standard state. Hidden in production builds. */
function StatePreviewNav({ pathname, current }: { pathname: Route; current: ScreenState }) {
  if (process.env.NODE_ENV === "production") return null;
  return (
    <nav aria-label={messages.states.preview} className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-muted-foreground">{messages.states.preview}:</span>
      <ul className="flex gap-1">
        {SCREEN_STATES.map((state) => (
          <li key={state}>
            <Link
              href={{ pathname, query: state === "vazio" ? {} : { estado: state } }}
              aria-current={state === current ? "true" : undefined}
              className={cn(
                "inline-flex min-h-6 items-center rounded-sm border px-2 py-0.5 font-medium hover:bg-secondary",
                state === current && "border-primary bg-accent text-accent-foreground",
              )}
            >
              {STATE_LABELS[state]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
