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

/**
 * `pnpm dev` without Caddy: proxy `/api/v1/*` to the API so the browser stays same-origin (ADR-0007 §9,
 * system-overview.md §3.1). Opt-in via `API_PROXY=1` (set by the `dev` script); the Compose stack (T-003)
 * never sets it, because Caddy already routes `/api/*` before the request reaches Next.js.
 */
const apiProxyTarget =
  process.env.API_PROXY === "1" ? (process.env.API_BASE_URL ?? "http://localhost:3001") : null;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // @linkedin-ops/ui ships TypeScript source; Next compiles it so `pnpm --filter @linkedin-ops/web <script>`
  // works without building dependencies first (Aurora P0 on PR #67).
  transpilePackages: ["@linkedin-ops/ui"],
  poweredByHeader: false,
  typedRoutes: true,
  // `msw/browser` has no `node` export; the dev-only dynamic import in src/mocks/mock-boot.tsx is still
  // compiled for the SSR layer, so it resolves to an empty module there (it never runs on the server).
  turbopack: {
    resolveAlias: { "msw/browser": { browser: "msw/browser", default: false } },
  },
  // Do not generate apps/web/AGENTS.md: agent guidance lives in the repo docs and CLAUDE.md.
  agentRules: false,
  headers() {
    return Promise.resolve([{ source: "/(.*)", headers: securityHeaders }]);
  },
  rewrites() {
    return Promise.resolve(
      apiProxyTarget
        ? [{ source: "/api/v1/:path*", destination: `${apiProxyTarget}/api/v1/:path*` }]
        : [],
    );
  },
};

export default nextConfig;
