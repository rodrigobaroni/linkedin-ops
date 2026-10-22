import { Module } from "@nestjs/common";
import type { DynamicModule } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import type { RuntimeEnv } from "@linkedin-ops/domain";
import type { Logger } from "pino";
import { AuthModule } from "./auth/auth.module.js";
import { CareerModule } from "./career/career.module.js";
import { ProblemDetailsFilter } from "./common/problem-details.filter.js";
import { RouteAccessGuard } from "./common/route-access.guard.js";
import { RuntimeEnvModule } from "./config/runtime-env.module.js";
import { HealthModule } from "./health/health.module.js";
import { LinkedInModule } from "./linkedin/linkedin.module.js";
import { API_LOGGER } from "./logging/logger.js";
import { DocsController } from "./openapi/docs.controller.js";
import { OpenApiController, PublicOpenApiController } from "./openapi/openapi.controller.js";
import { SessionModule } from "./session/session.module.js";

export interface AppModuleOptions {
  env: RuntimeEnv;
  logger: Logger;
}

@Module({})
export class AppModule {
  static forRoot({ env, logger }: AppModuleOptions): DynamicModule {
    const development = env.nodeEnv === "development";
    return {
      module: AppModule,
      imports: [
        RuntimeEnvModule.forRoot(env),
        SessionModule,
        HealthModule,
        AuthModule,
        LinkedInModule.forRoot(logger),
        CareerModule.forRoot(logger),
      ],
      controllers: [
        // `/openapi.json` is public in development and session-only elsewhere (contracts.md §5);
        // Swagger UI (`/docs`) exists in development only.
        ...(development ? [PublicOpenApiController, DocsController] : [OpenApiController]),
      ],
      providers: [
        { provide: API_LOGGER, useValue: logger },
        { provide: APP_GUARD, useClass: RouteAccessGuard },
        { provide: APP_FILTER, useClass: ProblemDetailsFilter },
      ],
    };
  }
}
