import "reflect-metadata";
import { Controller, Get } from "@nestjs/common";
import { ContractRoute } from "../src/common/contract-route.decorator.js";

/** Throws like a bug in a handler would; proves the 500 path of `ProblemDetailsFilter`. */
@Controller()
export class BoomController {
  @Get("__probe/boom")
  @ContractRouteFree()
  boom(): never {
    throw new Error("secret internal detail");
  }
}

/** A Nest route with neither `@ContractRoute` nor `@RouteAuth`: the guard must default to `session`. */
@Controller()
export class UnregisteredController {
  @Get("__probe/unregistered")
  unregistered(): { ok: true } {
    return { ok: true };
  }
}

/** Bound to an elevated, OWNER-only registry route so the guard's elevated branch can be exercised. */
@Controller()
export class ElevatedProbeController {
  @ContractRoute("settings.autonomy.update")
  update(): { ok: true } {
    return { ok: true };
  }
}

/** The 500 probe must not need a session: mark it public explicitly. */
function ContractRouteFree(): MethodDecorator {
  return (target, key, descriptor) => {
    Reflect.defineMetadata("linkedin-ops:route-auth", "none", descriptor.value as object);
  };
}
