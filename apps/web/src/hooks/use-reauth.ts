"use client";

import { useCallback } from "react";
import { isApiProblem } from "@/lib/api";
import { isElevated, useAuth } from "@/providers/auth-provider";

/**
 * For 🔐 actions (publish now, change autonomy mode, connect LinkedIn, change password):
 * `withElevation(run)` asks for the password first when the session is not elevated and retries `run`
 * once after a `401 AUTH_REAUTH_REQUIRED`. Resolves `undefined` when the user cancels the dialog.
 */
export function useReauth() {
  const { elevatedUntil, ensureElevated } = useAuth();

  const withElevation = useCallback(
    async <T>(run: () => Promise<T>): Promise<T | undefined> => {
      if (!(await ensureElevated())) return undefined;
      try {
        return await run();
      } catch (error) {
        if (!isApiProblem(error, "AUTH_REAUTH_REQUIRED")) throw error;
        // The elevation expired between the check and the call: ask once more, then give up.
        if (!(await ensureElevated())) return undefined;
        return run();
      }
    },
    [ensureElevated],
  );

  return { elevatedUntil, isElevated: isElevated(elevatedUntil), ensureElevated, withElevation };
}
