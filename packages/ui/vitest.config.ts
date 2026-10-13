import { defineConfig, mergeConfig } from "vitest/config";
import base from "@linkedin-ops/config/vitest";

export default mergeConfig(
  base,
  defineConfig({
    test: {
      environment: "jsdom",
      include: ["src/**/*.{test,spec}.{ts,tsx}", "test/**/*.{test,spec}.{ts,tsx}"],
      setupFiles: ["./src/test/setup.ts"],
    },
  }),
);
