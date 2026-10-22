import { authHandlers } from "./auth-handlers";
import { careerHandlers } from "./career-handlers";
import { publishingHandlers } from "./publishing-handlers";

/** Every mocked route, in one place (apps/web/README.md "Mock da API"). */
export const handlers = [...authHandlers, ...publishingHandlers, ...careerHandlers];
