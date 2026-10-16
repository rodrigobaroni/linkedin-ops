# @linkedin-ops/ui

Shared React components (shadcn/ui style, Radix via `radix-ui`, `class-variance-authority`) and the design tokens for `apps/web`. No data fetching, no business rules: components receive state and actions through typed props.

- `@linkedin-ops/ui/styles.css` — tokens from `docs/product/design/design-tokens.md` as a Tailwind CSS v4 preset (semantic HSL variables + `@theme`), base styles (focus ring, reduced motion). The app imports it after `@import "tailwindcss"`.
- Primitives: `Button`, `Badge`, `Card*`, `Skeleton`, `Alert*`, `Separator`, `Sheet*`, `Breadcrumb*`, `Tooltip*` (hover + focus, Escape closes; mount `TooltipProvider` once), `Popover*`.
- Patterns: `EmptyState`, `LoadingState`, `ErrorState` (screen-states.md), `AutonomyModeBadge` (three modes, icon + text).
- `AutonomyMode` type mirrors `docs/architecture/data-model.md` until `@linkedin-ops/contracts` exports it (T-004).

No build step: `exports` point at `src/`, and `apps/web` compiles the package through `transpilePackages` (so `pnpm --filter @linkedin-ops/web <script>` works in a clean clone without building dependencies). Internal imports are extensionless (`moduleResolution: Bundler`). Tests: Vitest + Testing Library + axe-core (jsdom).
