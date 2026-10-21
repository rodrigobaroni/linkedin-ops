"use client";

import { type ReactNode, useEffect, useState } from "react";

/**
 * Starts the MSW worker before the app renders, in development with `NEXT_PUBLIC_API_MOCK=1` only.
 * Both checks are build-time constants, so the `import()` below is dead code in every other build and
 * `msw` plus the handlers are excluded from the bundle.
 */
const MOCK_ENABLED =
  process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_API_MOCK === "1";

export function MockBoot({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!MOCK_ENABLED);

  useEffect(() => {
    if (!MOCK_ENABLED) return;
    let cancelled = false;
    import("./browser")
      .then((module) => module.startMockWorker())
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((error: unknown) => {
        console.error("[mock] failed to start the API mock", error);
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return ready ? children : null;
}
