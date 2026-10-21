import {
  API_V1_BASE_PATH,
  CSRF_TOKEN_HEADER,
  REQUESTED_WITH_HEADER,
  type RouteDefinition,
} from "@linkedin-ops/contracts";
import type { z } from "zod";
import type { CsrfTokenStore } from "./csrf-token-store";
import { ApiNetworkError, ApiProblem, problemFromResponse } from "./problem";

const JSON_CONTENT_TYPE = "application/json";
const MUTATION_METHODS: ReadonlySet<RouteDefinition["method"]> = new Set([
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);

export type ApiClientOptions = {
  tokenStore: CsrfTokenStore;
  /**
   * Called once on `403 CSRF_REJECTED` before the single retry (ADR-0007 N2): must refresh the token
   * (`GET /auth/me`) and store it. Its own failure (e.g. `401`) is propagated instead of the retry.
   */
  refreshCsrfToken: () => Promise<void>;
  fetch?: typeof fetch;
  /** Defaults to `/api/v1`, same origin (Caddy in production, Next.js rewrite in `pnpm dev`). */
  basePath?: string;
};

export type RequestOptions<Route extends RouteDefinition> = {
  params?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  body?: Route["body"] extends z.ZodType ? z.input<Route["body"]> : never;
  /** Send `X-CSRF-Token` even when the route is not marked `elevated` (defensive callers). */
  csrf?: boolean;
  signal?: AbortSignal;
};

type SuccessBody<Route extends RouteDefinition> = Route["responses"][200] extends z.ZodType
  ? z.output<Route["responses"][200]>
  : Route["responses"][201] extends z.ZodType
    ? z.output<Route["responses"][201]>
    : Route["responses"][202] extends z.ZodType
      ? z.output<Route["responses"][202]>
      : undefined;

export type ApiClient = {
  request: <Route extends RouteDefinition>(
    route: Route,
    options?: RequestOptions<Route>,
  ) => Promise<SuccessBody<Route>>;
};

/** `/auth/sessions/{id}` + `{ id }` → `/auth/sessions/<encoded id>`. */
export function buildPath(path: string, params: Record<string, string> = {}): string {
  return path.replace(/\{([A-Za-z0-9_]+)\}/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`Missing path param "${name}" for ${path}`);
    return encodeURIComponent(value);
  });
}

function buildQuery(query: RequestOptions<RouteDefinition>["query"]): string {
  if (!query) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

/** Same-origin absolute URL: `fetch` in Node (Vitest/MSW) does not resolve relative paths by itself. */
function resolveUrl(path: string): string {
  return typeof location === "undefined" ? path : new URL(path, location.href).toString();
}

/**
 * Typed `fetch` over the route registry (`routesV1`). Every call sends the session cookie
 * (`credentials: "include"`); every mutation sends `Content-Type: application/json` and
 * `X-Requested-With: linkedin-ops` (ADR-0007 N4); `elevated` routes add `X-CSRF-Token`. The token
 * returned in the `X-CSRF-Token` response header (session rotation, N2) is stored before the body is
 * parsed. On `403 CSRF_REJECTED` the token is refreshed via `GET /auth/me` and the call is retried once.
 */
export function createApiClient(options: ApiClientOptions): ApiClient {
  const { tokenStore, refreshCsrfToken, basePath = API_V1_BASE_PATH } = options;
  const fetchImpl = options.fetch ?? ((input, init) => globalThis.fetch(input, init));

  async function send<Route extends RouteDefinition>(
    route: Route,
    requestOptions: RequestOptions<Route>,
    attempt: number,
  ): Promise<SuccessBody<Route>> {
    const url = resolveUrl(
      `${basePath}${buildPath(route.path, requestOptions.params)}${buildQuery(requestOptions.query)}`,
    );
    const isMutation = MUTATION_METHODS.has(route.method);
    const headers = new Headers({ Accept: JSON_CONTENT_TYPE });
    if (isMutation) {
      headers.set("Content-Type", JSON_CONTENT_TYPE);
      headers.set(REQUESTED_WITH_HEADER.name, REQUESTED_WITH_HEADER.value);
    }
    if (route.auth === "elevated" || requestOptions.csrf) {
      const token = tokenStore.get();
      if (token) headers.set(CSRF_TOKEN_HEADER, token);
    }

    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: route.method,
        headers,
        credentials: "include",
        cache: "no-store",
        // Mutations always carry a JSON body (possibly `{}`) so the Content-Type check is meaningful.
        body: isMutation ? JSON.stringify(requestOptions.body ?? {}) : undefined,
        signal: requestOptions.signal,
      });
    } catch (cause) {
      throw new ApiNetworkError(cause);
    }

    const rotated = response.headers.get(CSRF_TOKEN_HEADER);
    if (rotated) tokenStore.set(rotated);

    if (!response.ok) {
      const problem = await problemFromResponse(response);
      if (problem.code === "CSRF_REJECTED" && attempt === 0) {
        await refreshCsrfToken();
        return send(route, requestOptions, attempt + 1);
      }
      throw problem;
    }

    const schema = route.responses[response.status as 200 | 201 | 202];
    if (response.status === 204 || !schema) return undefined as SuccessBody<Route>;

    let json: unknown;
    try {
      json = await response.json();
    } catch (cause) {
      throw new ApiNetworkError(cause);
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new ApiProblem({
        code: "INTERNAL",
        status: 500,
        title: "Resposta inesperada da API",
        detail: `${route.method} ${route.path}: ${parsed.error.issues[0]?.message ?? "schema mismatch"}`,
      });
    }
    return parsed.data as SuccessBody<Route>;
  }

  return {
    request: (route, requestOptions = {}) => send(route, requestOptions, 0),
  };
}
