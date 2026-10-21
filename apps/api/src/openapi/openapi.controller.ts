import { Controller, Get, Header, Inject } from "@nestjs/common";
import { buildOpenApiDocument, type OpenApiDocument } from "@linkedin-ops/contracts";
import type { RuntimeEnv } from "@linkedin-ops/domain";
import { RouteAuth } from "../common/contract-route.decorator.js";
import { RUNTIME_ENV } from "../config/runtime-env.module.js";

/**
 * `GET /api/v1/openapi.json`: the document generated from `packages/contracts` (the committed
 * `openapi/v1.json` is the same bytes; the drift test proves it). Public in development, session-only
 * elsewhere (contracts.md §5). Both variants are declared so the guard sees an explicit level.
 */
@Controller()
export class OpenApiController {
  private readonly document: OpenApiDocument = buildOpenApiDocument();

  constructor(@Inject(RUNTIME_ENV) private readonly env: RuntimeEnv) {}

  @Get("openapi.json")
  @RouteAuth("session")
  @Header("Cache-Control", "no-store")
  document_(): OpenApiDocument {
    return this.document;
  }
}

@Controller()
export class PublicOpenApiController {
  private readonly document: OpenApiDocument = buildOpenApiDocument();

  @Get("openapi.json")
  @RouteAuth("none")
  @Header("Cache-Control", "no-store")
  document_(): OpenApiDocument {
    return this.document;
  }
}
