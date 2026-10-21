"use client";

import { type ReactNode, useEffect, useState } from "react";

/**
 * Starts the MSW worker before the app renders, in development with `NEXT_PUBLIC_API_MOCK=1` only.
 * Both checks are build-time constants, so `startFromBundle` is `null` in every other build and `msw` plus
 * the handlers are excluded from the bundle.
 */
const MOCK_ENABLED =
  process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_API_MOCK === "1";

const startFromBundle: (() => Promise<void>) | null = MOCK_ENABLED
  ? () => import("./browser").then((module) => module.startMockWorker())
  : null;

export type MockBootProps = {
  children: ReactNode;
  /** Test seam; defaults to the dynamic import above (or `null` outside `pnpm dev:mock`). */
  start?: (() => Promise<void>) | null;
};

/**
 * Children (and with them the first `GET /auth/me`) mount only after the worker is active. If the worker
 * fails to start the app is NOT rendered against the real network: the error is shown instead, because a
 * request that escapes the mock would turn into a misleading "session unavailable".
 */
export function MockBoot({ children, start = startFromBundle }: MockBootProps) {
  const [state, setState] = useState<"starting" | "ready" | "failed">(
    start === null ? "ready" : "starting",
  );

  useEffect(() => {
    if (start === null) return;
    let cancelled = false;
    start()
      .then(() => {
        if (!cancelled) setState("ready");
      })
      .catch((error: unknown) => {
        console.error("[mock] failed to start the API mock", error);
        if (!cancelled) setState("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [start]);

  if (state === "ready") return children;
  if (state === "failed") {
    return (
      <p role="alert" className="p-6 text-sm text-destructive">
        Mock da API (pnpm dev:mock) não iniciou. Veja o console do navegador.
      </p>
    );
  }
  return null;
}
