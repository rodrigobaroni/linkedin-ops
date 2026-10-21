import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { validateRuntimeEnv } from "@linkedin-ops/domain";
import { randomBytes } from "node:crypto";
import { Test } from "@nestjs/testing";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import supertest from "supertest";
import { AppModule } from "../src/app.module.js";
import { configureApp, createFastifyAdapter } from "../src/app.factory.js";
import { createLogger } from "../src/logging/logger.js";
import { LogCapture } from "./helpers.js";

/** Same image reference as packages/domain and the CI service (TM-21). */
const POSTGRES_IMAGE =
  "postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24";

describe("GET /api/v1/ready against a real PostgreSQL", () => {
  let container: StartedPostgreSqlContainer;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
    const env = validateRuntimeEnv({
      NODE_ENV: "test",
      APP_BASE_URL: "https://ops.example.test",
      DATABASE_URL: container.getConnectionUri(),
      SESSION_SECRET: randomBytes(48).toString("base64"),
      ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    });
    const logger = createLogger({ level: "warn", pretty: false, stream: new LogCapture().stream });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot({ env, logger })],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter(logger), {
      bufferLogs: true,
      bodyParser: false,
    });
    await configureApp(app, env, logger);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  it("answers 200 with database=ok and queue=skipped", async () => {
    const res = await supertest(app.getHttpServer()).get("/api/v1/ready").expect(200);
    expect(res.body).toEqual({ status: "ok", checks: { database: "ok", queue: "skipped" } });
  });
});
