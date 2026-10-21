# @linkedin-ops/web

Dashboard web (Next.js App Router, React, Tailwind CSS v4, shadcn/ui via `@linkedin-ops/ui`). Presentation only: never holds secrets or a database connection; it talks to `apps/api` through the typed client in `src/lib/api` over the route registry of `@linkedin-ops/contracts`. UI copy is PT-BR.

## Scripts

```bash
pnpm --filter @linkedin-ops/web dev        # http://localhost:3000 (redirects to /hoje); proxies /api/v1 → API_BASE_URL
pnpm --filter @linkedin-ops/web dev:mock   # same, with the API mocked in the browser (MSW) — no API needed
pnpm --filter @linkedin-ops/web test       # Vitest + Testing Library + axe-core (jsdom), API mocked with MSW
pnpm --filter @linkedin-ops/web typecheck  # next typegen + tsc
pnpm --filter @linkedin-ops/web build      # next build + guard that the API mock is not in the bundle
```

`dev` sets `API_PROXY=1`, which turns on a Next.js rewrite from `/api/v1/*` to `API_BASE_URL`
(default `http://localhost:3001`) so the browser stays same-origin without Caddy (ADR-0007 §9). The
Compose stack never sets it: Caddy routes `/api/*` before Next.js sees the request.

## Authentication (T-015, ADR-0007)

- `GET /auth/me` decides the session state (`src/providers/auth-provider.tsx`); the cookie is `HttpOnly`,
  so there is no middleware: `RequireSession` (in the `(app)` layout) shows a skeleton until the API
  answers, sends anonymous visitors to `/login?next=<destination>` and explains an unreachable API.
- `/login` lives outside the shell (`(auth)` route group). `next` is accepted only as a same-origin
  relative path (`src/lib/next-path.ts`).
- The CSRF token exists **only in memory** (`CsrfTokenStore`, never `localStorage`/`sessionStorage`/
  cookies/URL/query cache). Every response that carries `X-CSRF-Token` rotates it; a `403 CSRF_REJECTED`
  triggers one `GET /auth/me` and one retry (`src/lib/api/http.ts`).
- Every mutation sends `credentials: include`, `Content-Type: application/json` and
  `X-Requested-With: linkedin-ops`; routes marked `elevated` in the contract add `X-CSRF-Token`.
- 🔐 actions use `useReauth().withElevation(run)`: it opens the password dialog (`ReauthDialog`) when the
  session is not elevated and retries once after `401 AUTH_REAUTH_REQUIRED`.
- Errors are RFC 9457 Problem Details mapped by `code` (`ApiProblem`); network failures are
  `ApiNetworkError`. The login form maps `RATE_LIMITED` to a countdown from `Retry-After`
  (integer seconds; 15 min when absent).

## Mock da API (MSW)

Handlers live in `src/mocks/` (one place, `handlers.ts`) and are shared by the browser worker and the
Vitest server (`src/test/setup.ts`). The browser worker starts only with `NODE_ENV=development` **and**
`NEXT_PUBLIC_API_MOCK=1` (`src/mocks/mock-boot.tsx`, dynamic import): `dev:mock` sets the variable and
generates `public/mockServiceWorker.js` (gitignored). `scripts/assert-no-mocks-in-bundle.mjs` runs after
`next build` and fails if any mock marker reaches `.next/static`. Dev credentials:
`rodrigo@example.com` / `linkedin-ops-dev-password` (mock only; 5 failures in a minute lock login for
15 min, like the API).

## Layout

```text
src/app/                    App Router: layout.tsx (html lang=pt-BR, mock boot, providers), page.tsx (→ /hoje), not-found.tsx
src/app/(auth)/login/       Public login page (no shell)
src/app/(app)/              Route group behind RequireSession with the shell (AppShell), loading.tsx, error.tsx and the placeholder routes
src/components/auth/        LoginForm/LoginScreen, RequireSession, LogoutButton, ReauthDialog
src/components/shell/       Skip link, sidebar (desktop/tablet), bottom nav + "Mais" drawer (mobile), page header, route focus
src/components/placeholder-screen.tsx   Header + empty/loading/error state; `?estado=vazio|carregando|erro` previews (dev only)
src/config/navigation.ts    Navigation map (docs/product/design/navigation-map.md)
src/config/screens.ts       Per-screen copy (docs/product/design/screen-states.md)
src/config/mock.ts          Mocked shell data until the APIs exist (unread count); LinkedIn status derived from the session
src/hooks/use-reauth.ts     `withElevation(run)` for 🔐 actions
src/lib/api/                Typed fetch client (headers, CSRF store, Problem Details), auth API
src/lib/next-path.ts        Safe `next` destination for /login
src/mocks/                  MSW handlers (dev + tests), browser worker, Node server, mock boot
src/providers/              TanStack Query provider; AuthProvider (session, CSRF token in memory, reauth dialog); AutonomyModeProvider (mocked ASSISTED)
src/i18n/pt-br.ts           Chrome and auth strings (no i18n framework)
src/test/                   axe helper, next/navigation mock, `renderApp` (providers + MSW), setup
```

Design tokens come from `@linkedin-ops/ui/styles.css` (imported in `src/app/globals.css`); the component package is consumed from source via `transpilePackages`, so the scripts above work in a clean clone right after `pnpm install`. Routes are typed (`typedRoutes`), so every `href` must exist. Security headers live in `next.config.ts`; a nonce-based CSP arrives with T-057.

## Turborepo

`apps/web/turbo.json` makes `build` depend on `typecheck`: both `next build` and `next typegen` write
`.next/types`, so running them concurrently (the default when `turbo lint typecheck test build` schedules
unrelated tasks) races and fails with `ENOENT .next/types/routes.d.ts`. Typecheck stays fast and
independent; build simply waits for it.
