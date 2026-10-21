import { Inject, Injectable, Module } from "@nestjs/common";
import type { OnApplicationShutdown } from "@nestjs/common";
import { createPrismaClient, type PrismaClient, type RuntimeEnv } from "@linkedin-ops/domain";
import { RUNTIME_ENV } from "../config/runtime-env.module.js";

export const PRISMA_CLIENT = Symbol("PRISMA_CLIENT");

/** Owns the Prisma client lifecycle. Connections open lazily on first query, so boot never waits for the DB. */
@Injectable()
export class PrismaLifecycle implements OnApplicationShutdown {
  constructor(@Inject(PRISMA_CLIENT) private readonly client: PrismaClient) {}

  async onApplicationShutdown(): Promise<void> {
    await this.client.$disconnect();
  }
}

@Module({
  providers: [
    {
      provide: PRISMA_CLIENT,
      inject: [RUNTIME_ENV],
      useFactory: (env: RuntimeEnv) => createPrismaClient({ connectionString: env.databaseUrl }),
    },
    PrismaLifecycle,
  ],
  exports: [PRISMA_CLIENT],
})
export class PrismaModule {}
