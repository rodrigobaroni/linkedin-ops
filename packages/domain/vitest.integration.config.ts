import { mergeConfig } from "vitest/config";
import base from "@linkedin-ops/config/vitest";

/**
 * Integration tests against a real PostgreSQL started with Testcontainers (needs Docker; runs in the
 * `db-integration` CI job). Each file starts its own container, so files run serially.
 */
export default mergeConfig(base, {
  test: {
    include: ["test/**/*.integration.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 240_000,
    passWithNoTests: false,
  },
});
