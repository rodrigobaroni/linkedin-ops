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

export const ROW_CANARY = "CANARIO-LINHA-0000";

/** Shaped like a Prisma 7 + adapter-pg CHECK violation: the offending row in `meta` and in the message. */
class PrismaClientKnownRequestError extends Error {
  readonly code = "P2010";
  readonly meta = {
    driverAdapterError: {
      cause: {
        originalCode: "23514",
        detail: `Failing row contains (https://x.example/${ROW_CANARY}).`,
      },
    },
  };

  constructor() {
    super(
      `Invalid \`tx.jobPosting.create()\` invocation:\n\nnew row violates check constraint "job_postings_url_check". Failing row contains (https://x.example/${ROW_CANARY}).`,
    );
    this.name = "PrismaClientKnownRequestError";
  }
}

/** A database error escaping a handler (QA #101): its log line must not carry the row. */
@Controller()
export class PrismaBoomController {
  @Get("__probe/prisma-boom")
  @ContractRouteFree()
  boom(): never {
    throw new PrismaClientKnownRequestError();
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
