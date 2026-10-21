import { Global, Module } from "@nestjs/common";
import {
  PrismaSessionService,
  PrismaUserProfiles,
  type PrismaClient,
  type RuntimeEnv,
} from "@linkedin-ops/domain";
import { RUNTIME_ENV } from "../config/runtime-env.module.js";
import { PRISMA_CLIENT, PrismaModule } from "../prisma/prisma.module.js";
import { SessionCookieWriter } from "./session-cookie.writer.js";
import { SESSION_SERVICE, USER_PROFILES } from "./session.service.js";

/** Binds the domain session port and the profile query to PostgreSQL (T-015). */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    {
      provide: SESSION_SERVICE,
      inject: [PRISMA_CLIENT, RUNTIME_ENV],
      useFactory: (prisma: PrismaClient, env: RuntimeEnv) =>
        new PrismaSessionService({ prisma, sessionSecret: env.sessionSecret }),
    },
    {
      provide: USER_PROFILES,
      inject: [PRISMA_CLIENT],
      useFactory: (prisma: PrismaClient) => new PrismaUserProfiles(prisma),
    },
    SessionCookieWriter,
  ],
  exports: [SESSION_SERVICE, USER_PROFILES, SessionCookieWriter],
})
export class SessionModule {}
