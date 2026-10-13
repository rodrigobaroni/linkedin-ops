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
  "**/upstream/**", // ADR-0006: vendored linkedin-skills snapshot is read-only reference material
];

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
        // Dependency direction (ADR-0001): nothing imports from apps/*; refined per-package rules land with T-004/T-021.
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: ["**/apps/*", "**/apps/**"],
                message: "Nothing may depend on apps/* (ADR-0001).",
              },
            ],
          },
        ],
      },
    },
    ...extra,
    prettier,
  );
}

export default config();
