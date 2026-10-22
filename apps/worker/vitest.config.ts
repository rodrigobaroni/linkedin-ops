import { mergeConfig } from "vitest/config";
import base from "@linkedin-ops/config/vitest";

export default mergeConfig(base, {
  test: { exclude: ["**/node_modules/**", "**/dist/**", "test/**/*.integration.test.ts"] },
});
