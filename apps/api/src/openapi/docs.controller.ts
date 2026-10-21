import { Controller, Get, Header } from "@nestjs/common";
import { RouteAuth } from "../common/contract-route.decorator.js";

export const DOCS_PATH = "/docs";
export const DOCS_ASSETS_PREFIX = "/docs/assets/";
export const DOCS_INIT_PATH = "/docs/init.js";

const HTML = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>LinkedIn Ops API · docs</title>
    <link rel="stylesheet" href="${DOCS_ASSETS_PREFIX}swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="${DOCS_ASSETS_PREFIX}swagger-ui-bundle.js"></script>
    <script src="${DOCS_ASSETS_PREFIX}swagger-ui-standalone-preset.js"></script>
    <script src="${DOCS_INIT_PATH}"></script>
  </body>
</html>
`;

const INIT_JS = `window.ui = SwaggerUIBundle({
  url: "/api/v1/openapi.json",
  dom_id: "#swagger-ui",
  presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
  layout: "StandaloneLayout",
  requestInterceptor: (req) => { req.headers["X-Requested-With"] = "linkedin-ops"; return req; },
});
`;

/**
 * Swagger UI at `/docs`, registered only when `NODE_ENV=development` (see `AppModule`). Assets are served
 * from the local `swagger-ui-dist` package (no CDN) and the page keeps a strict CSP (no inline script).
 */
@Controller()
export class DocsController {
  @Get("docs")
  @RouteAuth("none")
  @Header("Content-Type", "text/html; charset=utf-8")
  @Header("Cache-Control", "no-store")
  @Header(
    "Content-Security-Policy",
    "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'",
  )
  page(): string {
    return HTML;
  }

  @Get("docs/init.js")
  @RouteAuth("none")
  @Header("Content-Type", "application/javascript; charset=utf-8")
  @Header("Cache-Control", "no-store")
  init(): string {
    return INIT_JS;
  }
}
