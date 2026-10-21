/**
 * Writes `openapi/v1.json` from the route registry. Run `pnpm --filter @linkedin-ops/contracts openapi:generate`
 * after changing routes or schemas; CI fails (`test/openapi.test.ts`) when the file is stale.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { serializeOpenApiDocument } from "../src/openapi/document.js";

const target = fileURLToPath(new URL("../openapi/v1.json", import.meta.url));
writeFileSync(target, serializeOpenApiDocument());
console.warn(`openapi written to ${target}`);
