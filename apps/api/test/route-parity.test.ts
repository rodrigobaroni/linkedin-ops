import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { PATH_METADATA, METHOD_METADATA, MODULE_METADATA } from "@nestjs/common/constants.js";
import { RequestMethod } from "@nestjs/common";
import type { DynamicModule, Type } from "@nestjs/common";
import { routesV1 } from "@linkedin-ops/contracts";
import { AppModule } from "../src/app.module.js";
import {
  contractRouteKeyOf,
  ROUTE_AUTH_KEY,
  toNestPath,
  type RouteKey,
} from "../src/common/contract-route.decorator.js";
import { createLogger } from "../src/logging/logger.js";
import { LogCapture, testEnv } from "./helpers.js";

/** Registry routes implemented so far; later tasks append here as they land their controllers. */
const IMPLEMENTED: readonly RouteKey[] = [
  "health.liveness",
  "health.readiness",
  "auth.login",
  "auth.logout",
  "auth.logoutAll",
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
  // Career module PR 2 (CV base)
  "career.cv.get",
  "career.cv.upload",
  "career.cv.confirm",
  "career.cv.delete",
  // Career module PR 3b (batches and job postings)
  "career.batches.create",
  "career.jobs.list",
  "career.jobs.get",
  "career.jobs.pasteText",
  "career.jobs.retry",
  "career.jobs.pdf",
  "career.jobs.delete",
];

type ModuleRef = Type<unknown> | DynamicModule | Promise<DynamicModule>;

/**
 * Every controller reachable from `AppModule.forRoot` (static `@Module` metadata plus dynamic module
 * fields), walked recursively — so a controller added anywhere in the module tree is covered without
 * editing this test.
 */
function controllersOf(root: DynamicModule): Type<unknown>[] {
  const found = new Set<Type<unknown>>();
  const seen = new Set<unknown>();
  const visit = (ref: ModuleRef): void => {
    if (ref instanceof Promise) throw new Error("async dynamic modules are not supported here");
    if (seen.has(ref)) return;
    seen.add(ref);
    const dynamic = typeof ref === "function" ? undefined : ref;
    const type = typeof ref === "function" ? ref : ref.module;
    const imports: ModuleRef[] = [
      ...((Reflect.getMetadata(MODULE_METADATA.IMPORTS, type) as ModuleRef[] | undefined) ?? []),
      ...((dynamic?.imports as ModuleRef[] | undefined) ?? []),
    ];
    const controllers: Type<unknown>[] = [
      ...((Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, type) as Type<unknown>[] | undefined) ??
        []),
      ...(dynamic?.controllers ?? []),
    ];
    for (const controller of controllers) found.add(controller);
    for (const child of imports) visit(child);
  };
  visit(root);
  return [...found];
}

function handlersOf(controller: Type<unknown>) {
  const prototype = controller.prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(prototype)
    .filter((name) => name !== "constructor" && typeof prototype[name] === "function")
    .map((name) => ({
      name: `${controller.name}.${name}`,
      handler: prototype[name] as (...args: never[]) => unknown,
    }))
    .filter(({ handler }) => Reflect.getMetadata(METHOD_METADATA, handler) !== undefined);
}

const logger = createLogger({ level: "silent", pretty: false, stream: new LogCapture().stream });
const VARIANTS = {
  production: AppModule.forRoot({ env: testEnv({ NODE_ENV: "production" }), logger }),
  development: AppModule.forRoot({ env: testEnv({ NODE_ENV: "development" }), logger }),
};

describe("controller ↔ routes/v1 parity (contracts.md §6 rule 2), derived from AppModule", () => {
  for (const [variant, module] of Object.entries(VARIANTS)) {
    const handlers = controllersOf(module).flatMap(handlersOf);

    it(`${variant}: every HTTP handler declares @ContractRoute or an explicit @RouteAuth`, () => {
      expect(handlers.length).toBeGreaterThan(0);
      for (const { name, handler } of handlers) {
        const key = contractRouteKeyOf(handler);
        const explicit = Reflect.getMetadata(ROUTE_AUTH_KEY, handler) as string | undefined;
        expect(key !== undefined || explicit !== undefined, `${name} has no auth level`).toBe(true);
      }
    });

    it(`${variant}: registry handlers use the registry's method and path`, () => {
      for (const { name, handler } of handlers) {
        const key = contractRouteKeyOf(handler);
        if (key === undefined) continue;
        const route = routesV1[key];
        expect(Reflect.getMetadata(PATH_METADATA, handler), name).toBe(toNestPath(route.path));
        expect(Reflect.getMetadata(METHOD_METADATA, handler), name).toBe(
          RequestMethod[route.method],
        );
      }
    });

    it(`${variant}: the implemented set matches exactly (no silent additions or removals)`, () => {
      const keys = handlers
        .map(({ handler }) => contractRouteKeyOf(handler))
        .filter((key): key is RouteKey => key !== undefined)
        .sort();
      expect(keys).toEqual([...IMPLEMENTED].sort());
    });
  }

  it("every implemented key exists in the registry", () => {
    for (const key of IMPLEMENTED) expect(routesV1).toHaveProperty(key);
  });
});
