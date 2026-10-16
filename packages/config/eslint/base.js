// Shared ESLint flat config (ESLint 10 + typescript-eslint 8).
// Usage in a workspace:  import { config } from "@linkedin-ops/config/eslint"; export default config();
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

/** Paths never linted in any workspace. */
export const ignores = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/.turbo/**",
  "**/coverage/**",
  "upstream/**", // ADR-0006: vendored linkedin-skills snapshot (packages/editorial-engine/upstream) is read-only reference material
];

const APPS_MESSAGE = "Nothing may depend on apps/* (ADR-0001).";
const UI_MESSAGE =
  "@linkedin-ops/ui is browser-only (React, Radix) and is consumed from source: only apps/web and packages/ui may import it (ADR-0001). It would type-check elsewhere and fail at runtime in Node.";

/**
 * `no-restricted-imports` options enforcing the dependency direction of ADR-0001.
 * Nothing imports from apps/*; `@linkedin-ops/ui` is allowed only where `allowUi` is set
 * (apps/web and packages/ui, via `allowUiImports`). Refined per-package rules land with T-004/T-021.
 * @param {{ allowUi?: boolean }} [options]
 * @returns {import("eslint").Linter.RuleEntry}
 */
export function noRestrictedImports({ allowUi = false } = {}) {
  const paths = [
    { name: "@linkedin-ops/api", message: APPS_MESSAGE },
    { name: "@linkedin-ops/web", message: APPS_MESSAGE },
    { name: "@linkedin-ops/worker", message: APPS_MESSAGE },
  ];
  const patterns = [
    {
      group: [
        "**/apps/*",
        "**/apps/**",
        "@linkedin-ops/api/*",
        "@linkedin-ops/web/*",
        "@linkedin-ops/worker/*",
      ],
      message: APPS_MESSAGE,
    },
  ];
  if (!allowUi) {
    paths.push({ name: "@linkedin-ops/ui", message: UI_MESSAGE });
    patterns.push({ group: ["@linkedin-ops/ui/*"], message: UI_MESSAGE });
  }
  return ["error", { paths, patterns }];
}

/** Append to `config(...)` in apps/web and packages/ui to allow importing `@linkedin-ops/ui`. */
export const allowUiImports = {
  name: "linkedin-ops/allow-ui-imports",
  rules: { "no-restricted-imports": noRestrictedImports({ allowUi: true }) },
};

/**
 * Build the flat config for a workspace.
 * @param {import("typescript-eslint").InfiniteDepthConfigWithExtends[]} extra additional config objects appended at the end
 * @returns {import("typescript-eslint").ConfigArray}
 */
export function config(...extra) {
  return tseslint.config(
    { ignores },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
      languageOptions: {
        ecmaVersion: 2023,
        sourceType: "module",
        globals: { ...globals.node, ...globals.es2023 },
      },
      rules: {
        // Code hygiene
        "no-console": ["warn", { allow: ["warn", "error"] }],
        eqeqeq: ["error", "smart"],
        "prefer-const": "error",
        "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
        "@typescript-eslint/no-unused-vars": [
          "error",
          { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
        ],
        // Dependency direction (ADR-0001); see `noRestrictedImports` below.
        "no-restricted-imports": noRestrictedImports(),
      },
    },
    ...extra,
    prettier,
  );
}

export default config();
