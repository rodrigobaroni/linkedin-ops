import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { resetMockAuth } from "@/mocks/auth-handlers";
import { server } from "@/mocks/node";

// API mock (MSW) over the same handlers as `pnpm dev:mock`; a request without a handler fails the test.
beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetMockAuth();
});

afterAll(() => {
  server.close();
});
