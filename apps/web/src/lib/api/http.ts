import {
  API_V1_BASE_PATH,
  CSRF_TOKEN_HEADER,
  IDEMPOTENCY_KEY_HEADER,
  PROBLEM_CONTENT_TYPE,
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
  /**
   * Body of a route declared `requestContentType: "multipart/form-data"` (the only kind that may carry one).
   * The browser sets the `Content-Type` with its boundary; the N4 headers are still sent.
   */
  formData?: Route["requestContentType"] extends "multipart/form-data" ? FormData : never;
  /** Send `X-CSRF-Token` even when the route is not marked `elevated` (defensive callers). */
  csrf?: boolean;
  /** `Idempotency-Key` header (contracts.md §1): one UUID per user intent, reused on retries of it. */
  idempotencyKey?: string;
  signal?: AbortSignal;
};

/**
 * Success of a binary route (`responseContentType: "application/pdf"`): the body as a `Blob` and the file
 * name from `Content-Disposition` (`null` when absent or not a safe ASCII name).
 */
export type BinaryBody = { blob: Blob; filename: string | null };

type SuccessBody<Route extends RouteDefinition> =
  Route["responseContentType"] extends "application/pdf"
    ? BinaryBody
    : Route["responses"][200] extends z.ZodType
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

/**
 * `attachment; filename="CV-Nome-Empresa-Cargo.pdf"` → the name, kept only when it is plain ASCII letters,
 * digits, dot, underscore and hyphen (the API emits exactly that); anything else yields `null` and the caller
 * picks its own name. `filename*` (RFC 5987) is not used by the API.
 */
export function filenameFromDisposition(value: string | null): string | null {
  const match = value ? /filename="([^"]*)"/i.exec(value) : null;
  const name = match?.[1];
  return name && /^[A-Za-z0-9._-]{1,200}$/.test(name) && !name.startsWith(".") ? name : null;
}

/** Same-origin absolute URL: `fetch` in Node (Vitest/MSW) does not resolve relative paths by itself. */
function resolveUrl(path: string): string {
  return typeof location === "undefined" ? path : new URL(path, location.href).toString();
}

/**
 * Typed `fetch` over the route registry (`routesV1`). Every call sends the session cookie
 * (`credentials: "include"`); every mutation sends `Content-Type: application/json` (or, on a route declared
 * multipart, the browser's `multipart/form-data` boundary) and `X-Requested-With: linkedin-ops` (ADR-0007 N4); `elevated` routes add `X-CSRF-Token`. The token
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
    const isMultipart = route.requestContentType === "multipart/form-data";
    if (isMultipart && !(requestOptions.formData instanceof FormData)) {
      throw new Error(`${route.method} ${route.path} is multipart: pass \`formData\``);
    }
    const isBinary = route.responseContentType === "application/pdf";
    // A binary route still answers errors as Problem Details.
    const headers = new Headers({
      Accept: isBinary
        ? `${route.responseContentType}, ${PROBLEM_CONTENT_TYPE}`
        : JSON_CONTENT_TYPE,
    });
    if (isMutation) {
      if (!isMultipart) headers.set("Content-Type", JSON_CONTENT_TYPE);
      headers.set(REQUESTED_WITH_HEADER.name, REQUESTED_WITH_HEADER.value);
    }
    if (route.auth === "elevated" || requestOptions.csrf) {
      const token = tokenStore.get();
      if (token) headers.set(CSRF_TOKEN_HEADER, token);
    }
    if (requestOptions.idempotencyKey) {
      headers.set(IDEMPOTENCY_KEY_HEADER, requestOptions.idempotencyKey);
    }

    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: route.method,
        headers,
        credentials: "include",
        cache: "no-store",
        // Mutations always carry a body (JSON, possibly `{}`) so the Content-Type check is meaningful.
        body: isMultipart
          ? requestOptions.formData
          : isMutation
            ? JSON.stringify(requestOptions.body ?? {})
            : undefined,
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

    if (isBinary) {
      let blob: Blob;
      try {
        blob = await response.blob();
      } catch (cause) {
        throw new ApiNetworkError(cause);
      }
      const filename = filenameFromDisposition(response.headers.get("Content-Disposition"));
      return { blob, filename } as SuccessBody<Route>;
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
