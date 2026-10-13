# @linkedin-ops/config

Shared tooling for every workspace: `tsconfig.base.json` (+ `tsconfig.library.json`, `tsconfig.app.json`), ESLint flat config (`@linkedin-ops/config/eslint`), Prettier (`@linkedin-ops/config/prettier`) and Vitest defaults (`@linkedin-ops/config/vitest`). React/JSX workspaces add `@linkedin-ops/config/eslint/react` (react-hooks + jsx-a11y). Tailwind tokens live in `packages/ui` (CSS-first, Tailwind v4); dependency-direction rules arrive with T-004.

Note: `eslint-plugin-jsx-a11y` declares a peer range up to ESLint 9 and runs unchanged on ESLint 10 (`strict-peer-dependencies=false` in `.npmrc`); drop this note when the upstream release widens the range.
