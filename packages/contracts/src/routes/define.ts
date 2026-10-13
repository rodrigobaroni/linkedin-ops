import type { z } from "zod";
import type { UserRole } from "../enums/user-role.js";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * - `none`: public (health, login, OAuth callback)
 * - `session`: `__Host-session` cookie + CSRF headers on mutations (ADR-0007)
 * - `elevated`: session re-authenticated in the last 15 min + `X-CSRF-Token` (🔐 in contracts.md)
 */
export type RouteAuth = "none" | "session" | "elevated";

export type SuccessStatus = 200 | 201 | 202 | 204 | 302;

export interface RouteDefinition {
  method: HttpMethod;
  /** Path relative to `/api/v1`, with `{param}` placeholders. */
  path: `/${string}`;
  summary: string;
  tag: string;
  auth: RouteAuth;
  /** Roles allowed; omitted = any authenticated role. High-risk actions are `OWNER_ONLY` (ADR-0007 §11). */
  roles?: readonly UserRole[];
  params?: z.ZodObject;
  query?: z.ZodType;
  body?: z.ZodType;
  /** Defaults to `application/json` when `body` is set. */
  requestContentType?: "application/json" | "multipart/form-data";
  /** Success responses; `null` = no body (204/302). Error responses are always `ProblemDetails`. */
  responses: Readonly<Partial<Record<SuccessStatus, z.ZodType | null>>>;
  /** Enqueues a job and answers 202 (⚡). */
  async?: true;
  /** `Idempotency-Key` header: optional on any action POST; required where contracts.md marks 🧾. */
  idempotencyKey?: "optional" | "required";
  /** Per-session/IP rate limit (auth, external calls). */
  rateLimited?: true;
}

export function defineRoutes<const T extends Record<string, RouteDefinition>>(routes: T): T {
  return routes;
}

/** Extracts `{param}` names from a route path. */
export function pathParamNames(path: string): string[] {
  return [...path.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1] as string);
}
