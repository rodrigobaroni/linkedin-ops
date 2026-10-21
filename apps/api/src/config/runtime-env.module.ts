import { Global, Module } from "@nestjs/common";
import type { DynamicModule } from "@nestjs/common";
import type { RuntimeEnv } from "@linkedin-ops/domain";

/** Injection token for the validated runtime environment (`validateRuntimeEnv`, packages/domain). */
export const RUNTIME_ENV = Symbol("RUNTIME_ENV");

@Global()
@Module({})
export class RuntimeEnvModule {
  static forRoot(env: RuntimeEnv): DynamicModule {
    return {
      module: RuntimeEnvModule,
      providers: [{ provide: RUNTIME_ENV, useValue: env }],
      exports: [RUNTIME_ENV],
    };
  }
}
