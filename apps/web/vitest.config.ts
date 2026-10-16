import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, mergeConfig } from "vitest/config";
import base from "@linkedin-ops/config/vitest";

export default mergeConfig(
  base,
  defineConfig({
    // tsconfig uses `jsx: preserve` for Next.js; the React plugin compiles JSX for Vitest.
    plugins: [react()],
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    test: {
      environment: "jsdom",
      include: ["src/**/*.{test,spec}.{ts,tsx}"],
      setupFiles: ["./src/test/setup.ts"],
    },
  }),
);
