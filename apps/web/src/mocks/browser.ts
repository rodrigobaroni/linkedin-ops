import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";

let started: Promise<void> | null = null;

/**
 * Browser worker for `pnpm dev:mock` only. Loaded through a dynamic import guarded by
 * `NODE_ENV === "development" && NEXT_PUBLIC_API_MOCK === "1"`, so it never reaches the production bundle
 * (`scripts/assert-no-mocks-in-bundle.mjs` verifies it after `next build`). Memoized: React Strict Mode
 * runs the boot effect twice, and a second `setupWorker().start()` must not race the first one.
 */
export function startMockWorker(): Promise<void> {
  started ??= setupWorker(...handlers)
    .start({ onUnhandledFrame: "bypass" })
    .then(() => undefined);
  return started;
}
