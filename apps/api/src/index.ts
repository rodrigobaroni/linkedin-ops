import "reflect-metadata";
import { RuntimeEnvError, validateRuntimeEnv } from "@linkedin-ops/domain";
import { createApp } from "./app.factory.js";
import { createLogger } from "./logging/logger.js";

async function bootstrap(): Promise<void> {
  let env;
  try {
    env = validateRuntimeEnv(process.env);
  } catch (error) {
    // No logger yet (its level comes from the env). Messages carry variable names only, never values.
    const message = error instanceof RuntimeEnvError ? error.message : String(error);
    console.error(`[api] refusing to start. ${message}`);
    process.exit(1);
  }

  const logger = createLogger({ level: env.logLevel, pretty: env.nodeEnv === "development" });
  if (env.encryptionKeyRing === null) {
    logger.warn(
      "ENCRYPTION_KEY is not configured (development only): token encryption at rest is unavailable",
    );
  }

  const app = await createApp({ env, logger });
  await app.listen({ port: env.apiPort, host: env.apiHost });
  logger.info({ port: env.apiPort, host: env.apiHost, nodeEnv: env.nodeEnv }, "api listening");
}

void bootstrap();
