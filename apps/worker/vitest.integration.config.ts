import { mergeConfig } from "vitest/config";
import base from "@linkedin-ops/config/vitest";

/** pg-boss against a real PostgreSQL (Testcontainers; needs Docker, runs in the `db-integration` CI job). */
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
