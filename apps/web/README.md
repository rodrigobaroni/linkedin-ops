# @linkedin-ops/web

Dashboard web (Next.js App Router, React, Tailwind CSS v4, shadcn/ui via `@linkedin-ops/ui`). Presentation only: never holds secrets or a database connection; it will talk to `apps/api` through the typed client from `@linkedin-ops/contracts` (T-004). UI copy is PT-BR.

## Scripts

```bash
pnpm --filter @linkedin-ops/web dev        # http://localhost:3000 (redirects to /hoje)
pnpm --filter @linkedin-ops/web test       # Vitest + Testing Library + axe-core (jsdom)
pnpm --filter @linkedin-ops/web typecheck  # next typegen + tsc
pnpm --filter @linkedin-ops/web build      # next build
```

## Layout

```text
src/app/                    App Router: layout.tsx (html lang=pt-BR, providers), page.tsx (→ /hoje), not-found.tsx
src/app/(app)/              Route group with the shell (AppShell), loading.tsx, error.tsx and the placeholder routes
src/components/shell/       Skip link, sidebar (desktop/tablet), bottom nav + "Mais" drawer (mobile), page header, route focus
src/components/placeholder-screen.tsx   Header + empty/loading/error state; `?estado=vazio|carregando|erro` previews (dev only)
src/config/navigation.ts    Navigation map (docs/product/design/navigation-map.md)
src/config/screens.ts       Per-screen copy (docs/product/design/screen-states.md)
src/config/mock.ts          Mocked shell data until the APIs exist (LinkedIn status, unread count, account name)
src/providers/              TanStack Query provider; AutonomyModeProvider (mocked ASSISTED, no business rules)
src/i18n/pt-br.ts           Chrome strings (no i18n framework)
```

Design tokens come from `@linkedin-ops/ui/styles.css` (imported in `src/app/globals.css`). Routes are typed (`typedRoutes`), so every `href` must exist. Security headers live in `next.config.ts`; a nonce-based CSP arrives with T-057.
