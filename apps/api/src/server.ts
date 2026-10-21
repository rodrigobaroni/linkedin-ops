// @linkedin-ops/api — placeholder HTTP listener so the Compose stack (Caddy routing, health checks) can be
// proven before the NestJS application exists (PR #80 review, Crivo 1).
// TODO(T-008): replaced by the NestJS app. Keep GET /api/v1/health answering the HealthStatus contract
// (packages/contracts, resources/health.ts) at this path: Caddy routes /api/* here and the Compose
// health check probes it.
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { HealthStatus } from "@linkedin-ops/contracts";

export const HEALTH_PATH = "/api/v1/health";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
} as const;

export function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  // Only the path is routed; query strings are ignored (and never logged here).
  const { pathname } = new URL(req.url ?? "/", "http://localhost");
  if (pathname !== HEALTH_PATH) {
    res.writeHead(404, JSON_HEADERS);
    res.end(JSON.stringify({ error: "NOT_FOUND" }));
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { ...JSON_HEADERS, allow: "GET, HEAD" });
    res.end(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }));
    return;
  }
  const body: HealthStatus = { status: "ok", uptimeSeconds: Math.floor(process.uptime()) };
  res.writeHead(200, JSON_HEADERS);
  res.end(req.method === "HEAD" ? undefined : JSON.stringify(body));
}

export function createApiServer(): Server {
  return createServer(handleRequest);
}
