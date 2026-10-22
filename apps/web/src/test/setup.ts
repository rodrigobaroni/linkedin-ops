import "@testing-library/jest-dom/vitest";
import { Blob as NodeBlob, File as NodeFile } from "node:buffer";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { resetMockAuth } from "@/mocks/auth-handlers";
import { resetMockCareer } from "@/mocks/career-handlers";
import { resetMockPublishing } from "@/mocks/publishing-handlers";
import { server } from "@/mocks/node";

// Multipart uploads (POST /career/cv): jsdom's FormData/File/Blob cannot be read by Node's fetch, and
// Vitest's jsdom `Request` shim fails to copy jsdom 30.1 Blob bytes ("Vitest cannot read the bytes of a
// jsdom Blob"). Tests use Node's own classes instead — the same Web APIs the browser provides natively —
// so a FormData body reaches MSW intact. The shim's parent class is Node's `Request`.
const NodeFormData = (await new Response(new URLSearchParams()).formData()).constructor;
Object.assign(globalThis, {
  Blob: NodeBlob,
  File: NodeFile,
  FormData: NodeFormData,
  Request: Object.getPrototypeOf(globalThis.Request) as typeof Request,
});

// API mock (MSW) over the same handlers as `pnpm dev:mock`; a request without a handler fails the test.
beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetMockAuth();
  resetMockPublishing();
  resetMockCareer();
});

afterAll(() => {
  server.close();
});
