import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";

/**
 * Browser worker for `pnpm dev:mock` only. Loaded through a dynamic import guarded by
 * `NODE_ENV === "development" && NEXT_PUBLIC_API_MOCK === "1"`, so it never reaches the production bundle
 * (`scripts/assert-no-mocks-in-bundle.mjs` verifies it after `next build`).
 */
export async function startMockWorker(): Promise<void> {
  const worker = setupWorker(...handlers);
  await worker.start({ onUnhandledFrame: "bypass" });
}
