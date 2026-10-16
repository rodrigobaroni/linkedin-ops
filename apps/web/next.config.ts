import type { NextConfig } from "next";

/**
 * Baseline browser hardening (ADR-0007 §8). Caddy adds HSTS in production; a strict, nonce-based CSP
 * arrives with T-057. `apps/web` never holds secrets: only `NEXT_PUBLIC_*` values reach the bundle.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // @linkedin-ops/ui ships TypeScript source; Next compiles it so `pnpm --filter @linkedin-ops/web <script>`
  // works without building dependencies first (Aurora P0 on PR #67).
  transpilePackages: ["@linkedin-ops/ui"],
  poweredByHeader: false,
  typedRoutes: true,
  // Do not generate apps/web/AGENTS.md: agent guidance lives in the repo docs and CLAUDE.md.
  agentRules: false,
  headers() {
    return Promise.resolve([{ source: "/(.*)", headers: securityHeaders }]);
  },
};

export default nextConfig;
