import { Module } from "@nestjs/common";
import type { DynamicModule } from "@nestjs/common";
import { TokenVault, type RuntimeEnv } from "@linkedin-ops/domain";
import type { Logger } from "pino";
import { RUNTIME_ENV } from "../config/runtime-env.module.js";
import { API_LOGGER } from "../logging/logger.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import {
  LinkedInApiClient,
  LINKEDIN_CONFIG,
  LINKEDIN_FETCH,
  type FetchLike,
} from "./linkedin.client.js";
import { LINKEDIN_JWKS, LinkedInIdTokenVerifier, remoteLinkedInJwks } from "./id-token.verifier.js";
import { LinkedInController } from "./linkedin.controller.js";
import { ADR_0007_RATE_LIMITS, LINKEDIN_RATE_LIMITS } from "./rate-limits.js";
import { LinkedInOAuthService, TOKEN_VAULT } from "./linkedin-oauth.service.js";
import { PublicationsController } from "./publications.controller.js";
import { PublicationsService } from "./publications.service.js";

/**
 * ADR-0007 N3: `LINKEDIN_PKCE=required` fails the boot loudly until G-01 proves PKCE for this confidential
 * app and the flow implements it; there is never a silent fallback to plain authorization code.
 */
export function linkedinConfigOf(env: RuntimeEnv): RuntimeEnv["linkedin"] {
  if (env.linkedin?.pkce === "required") {
    throw new Error(
      "LINKEDIN_PKCE=required is not supported yet (G-01: PKCE unproven for this app); set LINKEDIN_PKCE=disabled",
    );
  }
  return env.linkedin;
}

@Module({})
export class LinkedInModule {
  /** The root Pino logger is passed in (it is an `AppModule` provider, not a global one). */
  static forRoot(logger: Logger): DynamicModule {
    return {
      module: LinkedInModule,
      imports: [PrismaModule],
      controllers: [LinkedInController, PublicationsController],
      providers: [
        { provide: API_LOGGER, useValue: logger },
        {
          provide: LINKEDIN_FETCH,
          useValue: ((input, init) => fetch(input, init)) satisfies FetchLike,
        },
        { provide: LINKEDIN_CONFIG, inject: [RUNTIME_ENV], useFactory: linkedinConfigOf },
        {
          provide: TOKEN_VAULT,
          inject: [RUNTIME_ENV],
          useFactory: (env: RuntimeEnv) => new TokenVault(env.encryptionKeyRing),
        },
        { provide: LINKEDIN_JWKS, inject: [LINKEDIN_FETCH], useFactory: remoteLinkedInJwks },
        { provide: LINKEDIN_RATE_LIMITS, useValue: ADR_0007_RATE_LIMITS },
        LinkedInApiClient,
        LinkedInIdTokenVerifier,
        LinkedInOAuthService,
        PublicationsService,
      ],
    };
  }
}
