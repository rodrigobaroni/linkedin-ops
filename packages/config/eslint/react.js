// Shared ESLint additions for React/JSX workspaces (packages/ui, apps/web).
// Usage: import { config } from "@linkedin-ops/config/eslint";
//        import { react } from "@linkedin-ops/config/eslint/react";
//        export default config(...react());
import globals from "globals";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";

/** Glob for files that may contain JSX. */
export const jsxFiles = ["**/*.{jsx,tsx}"];

/**
 * React Hooks + JSX accessibility rules, scoped to JSX files, plus browser globals.
 * `eslint-plugin-jsx-a11y` declares a peer range up to ESLint 9; it runs unchanged on ESLint 10
 * (rule API unchanged) — keep an eye on the upstream release that widens the range.
 * @param {import("typescript-eslint").InfiniteDepthConfigWithExtends[]} extra additional config objects
 * @returns {import("typescript-eslint").InfiniteDepthConfigWithExtends[]}
 */
export function react(...extra) {
  return [
    {
      files: jsxFiles,
      ...reactHooks.configs.flat.recommended,
    },
    {
      files: jsxFiles,
      ...jsxA11y.flatConfigs.recommended,
    },
    {
      files: ["**/*.{js,jsx,ts,tsx}"],
      languageOptions: {
        globals: { ...globals.browser, ...globals.es2023 },
      },
    },
    ...extra,
  ];
}
