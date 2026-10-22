import {
  applyDecorators,
  Header,
  HttpCode,
  RequestMapping,
  RequestMethod,
  SetMetadata,
} from "@nestjs/common";
import { routesV1 as routes, type RouteAuth, type RouteDefinition } from "@linkedin-ops/contracts";

export type RouteKey = keyof typeof routes;

export const CONTRACT_ROUTE_KEY = "linkedin-ops:contract-route";
/** Explicit auth level for the few routes outside the registry (`/openapi.json`, `/docs`). */
export const ROUTE_AUTH_KEY = "linkedin-ops:route-auth";

/**
 * Tags whose responses must never be cached by the browser or an intermediary (ADR-0007, Sentinela):
 * session data, and the owner's CV (personal data).
 */
export const NO_STORE_TAGS: ReadonlySet<string> = new Set(["auth", "career"]);

const METHODS: Record<RouteDefinition["method"], RequestMethod> = {
  GET: RequestMethod.GET,
  POST: RequestMethod.POST,
  PUT: RequestMethod.PUT,
  PATCH: RequestMethod.PATCH,
  DELETE: RequestMethod.DELETE,
};

/** `/drafts/{id}/approve` → `/drafts/:id/approve` (Nest/Fastify syntax). */
export function toNestPath(path: string): string {
  return path.replaceAll(/\{([A-Za-z0-9_]+)\}/g, ":$1");
}

export function successStatusOf(route: RouteDefinition): number {
  const statuses = Object.keys(route.responses).map(Number);
  if (statuses.length !== 1) {
    throw new Error(`Route must declare exactly one success status (found ${statuses.length})`);
  }
  return statuses[0] as number;
}

/**
 * Binds a handler to one entry of `routes/v1.ts` (`packages/contracts`): method, path, success status,
 * cache policy, auth level and the Zod schemas all come from the registry, so a handler cannot drift from
 * the contract. `RouteAccessGuard`, `ContractBody/Query/Params` and the parity test read the same key.
 */
export function ContractRoute(key: RouteKey): MethodDecorator {
  const route = routes[key];
  const decorators: MethodDecorator[] = [
    SetMetadata(CONTRACT_ROUTE_KEY, key),
    RequestMapping({ path: toNestPath(route.path), method: METHODS[route.method] }),
    HttpCode(successStatusOf(route)),
  ];
  if (NO_STORE_TAGS.has(route.tag)) decorators.push(Header("Cache-Control", "no-store"));
  return applyDecorators(...decorators);
}

/** Auth level for a handler that is not part of the registry. Default without it is `session` (fail closed). */
export function RouteAuth(level: RouteAuth): MethodDecorator {
  return SetMetadata(ROUTE_AUTH_KEY, level);
}

export function contractRouteOf(handler: object): RouteDefinition | undefined {
  const key = Reflect.getMetadata(CONTRACT_ROUTE_KEY, handler) as RouteKey | undefined;
  return key === undefined ? undefined : routes[key];
}

export function contractRouteKeyOf(handler: object): RouteKey | undefined {
  return Reflect.getMetadata(CONTRACT_ROUTE_KEY, handler) as RouteKey | undefined;
}
