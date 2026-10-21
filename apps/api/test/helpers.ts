import "reflect-metadata";
import { randomBytes } from "node:crypto";
import { Writable } from "node:stream";
import type { Type } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { validateRuntimeEnv, type RuntimeEnv } from "@linkedin-ops/domain";
import type { FastifyInstance } from "fastify";
import supertest from "supertest";
import { AppModule } from "../src/app.module.js";
import { configureApp, createFastifyAdapter } from "../src/app.factory.js";
import { REQUESTED_WITH_VALUE } from "../src/common/route-access.guard.js";
import { READINESS_PROBES, type ReadinessProbe } from "../src/health/readiness.probes.js";
import { createLogger } from "../src/logging/logger.js";
import { PRISMA_CLIENT } from "../src/prisma/prisma.module.js";
import { InMemorySessionService, type TestUser } from "../src/session/in-memory-session.service.js";
import { SESSION_COOKIE_NAME } from "../src/session/session.service.js";

export const APP_BASE_URL = "https://ops.example.test";

export function testEnv(overrides: Record<string, string | undefined> = {}): RuntimeEnv {
  return validateRuntimeEnv({
    NODE_ENV: "test",
    APP_BASE_URL,
    DATABASE_URL: "postgresql://api:api-test-password@127.0.0.1:1/api_test",
    SESSION_SECRET: randomBytes(48).toString("base64"),
    ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    LOG_LEVEL: "info",
    ...overrides,
  });
}

export const TEST_USER: TestUser = {
  id: "0192f4a0-0000-7000-8000-000000000001",
  email: "rodrigo@example.test",
  name: "Rodrigo",
  role: "OWNER",
  locale: "pt-BR",
  timezone: "America/Sao_Paulo",
};

/** Captures every log line as parsed JSON (the logger writes NDJSON). */
export class LogCapture {
  readonly lines: Record<string, unknown>[] = [];
  readonly stream = new Writable({
    write: (chunk: Buffer, _encoding, callback) => {
      for (const line of chunk.toString("utf8").split("\n")) {
        if (line.trim() !== "") this.lines.push(JSON.parse(line) as Record<string, unknown>);
      }
      callback();
    },
  });
  get text(): string {
    return JSON.stringify(this.lines);
  }
}

export interface TestApp {
  app: NestFastifyApplication;
  fastify: FastifyInstance;
  request: ReturnType<typeof supertest>;
  sessions: InMemorySessionService;
  logs: LogCapture;
  env: RuntimeEnv;
  close(): Promise<void>;
}

export interface CreateTestAppOptions {
  env?: RuntimeEnv;
  /** Test-only controllers mounted next to the application ones (same global prefix, guard and filter). */
  controllers?: Type<unknown>[];
  /** Replace readiness probes (default: database `failed` because there is no DB, queue `skipped`). */
  probes?: ReadinessProbe[];
}

export async function createTestApp(options: CreateTestAppOptions = {}): Promise<TestApp> {
  const env = options.env ?? testEnv();
  const logs = new LogCapture();
  const logger = createLogger({ level: "info", pretty: false, stream: logs.stream });

  let builder = Test.createTestingModule({
    imports: [AppModule.forRoot({ env, logger })],
    controllers: options.controllers ?? [],
  })
    // No database in these suites: the Prisma client is replaced by a stub that fails to connect fast.
    .overrideProvider(PRISMA_CLIENT)
    .useValue({
      $queryRaw: () => Promise.reject(new Error("no database")),
      $disconnect: async () => {},
    });
  if (options.probes) builder = builder.overrideProvider(READINESS_PROBES).useValue(options.probes);

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    createFastifyAdapter(logger),
    {
      bufferLogs: true,
      bodyParser: false,
    },
  );
  await configureApp(app, env, logger);
  await app.init();
  const fastify = app.getHttpAdapter().getInstance() as unknown as FastifyInstance;
  await fastify.ready();

  return {
    app,
    fastify,
    request: supertest(app.getHttpServer()),
    sessions: moduleRef.get(InMemorySessionService),
    logs,
    env,
    close: () => app.close(),
  };
}

/** Headers every legitimate browser mutation carries (ADR-0007 N4). */
export function mutationHeaders(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    origin: APP_BASE_URL,
    "content-type": "application/json",
    "x-requested-with": REQUESTED_WITH_VALUE,
    ...overrides,
  };
}

export function cookieHeader(cookieValue: string): string {
  return `${SESSION_COOKIE_NAME}=${cookieValue}`;
}
