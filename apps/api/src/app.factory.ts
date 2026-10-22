import { createRequire } from "node:module";
import { dirname } from "node:path";
import fastifyCookie from "@fastify/cookie";
import fastifyHelmet from "@fastify/helmet";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { CV_UPLOAD_LIMITS } from "@linkedin-ops/contracts";
import type { RuntimeEnv } from "@linkedin-ops/domain";
import type { FastifyInstance } from "fastify";
import type { Logger } from "pino";
import { AppModule } from "./app.module.js";
import { CORRELATION_ID_HEADER, newCorrelationId } from "./common/correlation.js";
import { PinoNestLogger } from "./logging/nest-logger.js";
import { DOCS_ASSETS_PREFIX } from "./openapi/docs.controller.js";

export const API_PREFIX = "api/v1";
/** 1 MiB: JSON payloads only; multipart uploads get their own limits (`MULTIPART_LIMITS`). */
export const BODY_LIMIT_BYTES = 1_048_576;

/**
 * Multipart parsing (@fastify/multipart) for the upload routes the registry declares; the guard rejects a
 * multipart body anywhere else before a handler could read it. One file part, no other field, kept in
 * memory and capped at the CV limit (the only upload route so far).
 */
export const MULTIPART_LIMITS = {
  fileSize: CV_UPLOAD_LIMITS.maxBytes,
  files: 1,
  fields: 0,
  parts: 1,
  fieldNameSize: 32,
  headerPairs: 20,
} as const;

export interface CreateAppOptions {
  env: RuntimeEnv;
  logger: Logger;
  /** Test hook: swap providers before the module compiles (Supertest suites). */
  moduleFactory?: (module: ReturnType<typeof AppModule.forRoot>) => Promise<NestFastifyApplication>;
}

/**
 * Builds the Fastify adapter with the process-wide settings that are not Nest's business: the shared Pino
 * logger, `req_<uuid v7>` request ids, body limit and a catch-all content-type parser. The parser accepts
 * (and discards) non-JSON bodies so that `RouteAccessGuard` can answer `403 CSRF_REJECTED` for form posts
 * instead of Fastify's generic 415; JSON stays on Fastify's strict built-in parser (prototype poisoning →
 * error). `X-Forwarded-For` is honoured only from `trustedProxies` (`TRUSTED_PROXY_CIDRS`, empty by
 * default), so `request.ip` — the key of login throttling — cannot be forged by a client.
 */
export function createFastifyAdapter(
  logger: Logger,
  trustedProxies: readonly string[] = [],
): FastifyAdapter {
  const adapter = new FastifyAdapter({
    loggerInstance: logger,
    genReqId: () => newCorrelationId(),
    // Incoming request-id headers are never trusted; request logs carry the id as `reqId`, Problem
    // Details and the exception filter as `correlationId` (same value).
    requestIdHeader: false,
    bodyLimit: BODY_LIMIT_BYTES,
    trustProxy: trustedProxies.length > 0 ? [...trustedProxies] : false,
    onProtoPoisoning: "error",
    onConstructorPoisoning: "error",
  });
  const fastify = adapter.getInstance() as unknown as FastifyInstance;
  fastify.addContentTypeParser("*", (_request, payload, done) => {
    payload.resume();
    payload.on("end", () => done(null, undefined));
    payload.on("error", (error) => done(error as Error));
  });
  return adapter;
}

/** Everything that must be applied to the Nest app regardless of how it was created (main or tests). */
export async function configureApp(
  app: NestFastifyApplication,
  env: RuntimeEnv,
  logger: Logger,
): Promise<void> {
  app.useLogger(new PinoNestLogger(logger));
  app.enableShutdownHooks();
  app.setGlobalPrefix(API_PREFIX, { exclude: ["docs", "docs/{*path}"] });

  const fastify = app.getHttpAdapter().getInstance() as unknown as FastifyInstance;
  await fastify.register(fastifyCookie);
  await fastify.register(fastifyHelmet, {
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: "same-origin" },
  });
  await fastify.register(fastifyMultipart, {
    limits: MULTIPART_LIMITS,
    throwFileSizeLimit: true,
  });
  fastify.addHook("onSend", async (request, reply) => {
    reply.header(CORRELATION_ID_HEADER, request.id);
  });

  if (env.nodeEnv === "development") {
    const require = createRequire(import.meta.url);
    const swaggerUiRoot = dirname(require.resolve("swagger-ui-dist/package.json"));
    await fastify.register(fastifyStatic, {
      root: swaggerUiRoot,
      prefix: DOCS_ASSETS_PREFIX,
      decorateReply: false,
      index: false,
      list: false,
      allowedPath: (pathName) => /^\/[A-Za-z0-9_.-]+\.(js|css|png|map)$/.test(pathName),
    });
  }
}

export async function createApp({
  env,
  logger,
}: CreateAppOptions): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot({ env, logger }),
    createFastifyAdapter(logger, env.trustedProxyCidrs),
    { bufferLogs: true, bodyParser: false },
  );
  await configureApp(app, env, logger);
  return app;
}
