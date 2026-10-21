import { mergeConfig } from "vitest/config";
import base from "@linkedin-ops/config/vitest";

/** Unit tests only (no database). Integration tests: `vitest.integration.config.ts`. */
export default mergeConfig(base, {
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.integration.test.ts"],
  },
});
