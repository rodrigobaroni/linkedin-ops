import nextPlugin from "@next/eslint-plugin-next";
import { config } from "@linkedin-ops/config/eslint";
import { react } from "@linkedin-ops/config/eslint/react";

export default config(
  { ignores: ["next-env.d.ts", ".next/**"] },
  ...react(),
  nextPlugin.configs["core-web-vitals"],
);
