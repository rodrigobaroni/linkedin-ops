import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

/** Application version reported by `GET /health`. */
export const APP_VERSION: string = pkg.version;
