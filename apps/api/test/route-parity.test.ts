import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { PATH_METADATA, METHOD_METADATA } from "@nestjs/common/constants.js";
import { RequestMethod } from "@nestjs/common";
import { routesV1 } from "@linkedin-ops/contracts";
import { AuthController } from "../src/auth/auth.controller.js";
import {
  contractRouteKeyOf,
  toNestPath,
  type RouteKey,
} from "../src/common/contract-route.decorator.js";
import { HealthController } from "../src/health/health.controller.js";
import { LinkedInController } from "../src/linkedin/linkedin.controller.js";
import { PublicationsController } from "../src/linkedin/publications.controller.js";

/** Routes T-008 implements; later tasks append here as they land their controllers. */
const IMPLEMENTED: readonly RouteKey[] = [
  "health.liveness",
  "health.readiness",
  "auth.login",
  "auth.reauth",
  "auth.me",
  // T-061/T-038/T-039 núcleo (MVP-0)
  "integrations.linkedin.get",
  "integrations.linkedin.connect",
  "integrations.linkedin.callback",
  "integrations.linkedin.disconnect",
  "publications.publishNow",
  "publications.list",
  "publications.get",
];

const CONTROLLERS = [HealthController, AuthController, LinkedInController, PublicationsController];

function handlersOf(controller: new (...args: never[]) => object) {
  const prototype = controller.prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(prototype)
    .filter((name) => name !== "constructor" && typeof prototype[name] === "function")
    .map((name) => prototype[name] as (...args: never[]) => unknown);
}

describe("controller ↔ routes/v1 parity (contracts.md §6 rule 2)", () => {
  const handlers = CONTROLLERS.flatMap(handlersOf);

  it("every handler is bound to a registry key, with the registry's method and path", () => {
    expect(handlers.length).toBeGreaterThan(0);
    for (const handler of handlers) {
      const key = contractRouteKeyOf(handler);
      expect(key, `${handler.name} must use @ContractRoute`).toBeDefined();
      const route = routesV1[key!];
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(toNestPath(route.path));
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod[route.method]);
    }
  });

  it("the implemented set matches exactly the handlers that exist (no silent additions or removals)", () => {
    const keys = handlers.map((handler) => contractRouteKeyOf(handler)).sort();
    expect(keys).toEqual([...IMPLEMENTED].sort());
  });

  it("every implemented key exists in the registry", () => {
    for (const key of IMPLEMENTED) expect(routesV1).toHaveProperty(key);
  });
});
