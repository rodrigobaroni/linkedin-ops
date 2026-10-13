// Shared Vitest defaults. Usage: import { defineConfig, mergeConfig } from "vitest/config";
//   import base from "@linkedin-ops/config/vitest"; export default mergeConfig(base, defineConfig({ ... }));
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts", "test/**/*.{test,spec}.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/upstream/**"],
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "coverage",
    },
  },
});
