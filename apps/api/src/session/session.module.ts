import { Global, Module } from "@nestjs/common";
import { InMemorySessionService } from "./in-memory-session.service.js";
import { SessionCookieWriter } from "./session-cookie.writer.js";
import { SESSION_SERVICE } from "./session.service.js";

/** TODO(T-015): bind `SESSION_SERVICE` to the PostgreSQL-backed implementation. */
@Global()
@Module({
  providers: [
    InMemorySessionService,
    { provide: SESSION_SERVICE, useExisting: InMemorySessionService },
    SessionCookieWriter,
  ],
  exports: [SESSION_SERVICE, SessionCookieWriter, InMemorySessionService],
})
export class SessionModule {}
