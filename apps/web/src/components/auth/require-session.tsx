"use client";

import { Button, ErrorState, LoadingState } from "@linkedin-ops/ui";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { messages } from "@/i18n/pt-br";
import { isApiProblem } from "@/lib/api";
import { loginHref } from "@/lib/next-path";
import { useAuth } from "@/providers/auth-provider";

/**
 * Gate for the `(app)` route group. The session cookie is HttpOnly and only the API can validate it, so
 * the decision comes from `GET /auth/me` (AuthProvider), not from a middleware: anonymous → `/login`
 * with the current destination in `next`; unavailable → explain and retry; authenticated → the shell.
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const { status, error, refresh } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (status !== "anonymous") return;
    const search = searchParams.toString();
    router.replace(loginHref(search ? `${pathname}?${search}` : pathname));
  }, [status, pathname, searchParams, router]);

  if (status === "authenticated") return children;

  if (status === "unavailable") {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
        <ErrorState
          title={messages.auth.session.unavailableTitle}
          description={messages.auth.session.unavailableDescription}
          correlationId={isApiProblem(error) ? error.correlationId : undefined}
          actions={
            <Button variant="outline" onClick={() => void refresh()}>
              {messages.states.retry}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6">
      <LoadingState
        label={
          status === "anonymous"
            ? messages.auth.session.redirecting
            : messages.auth.session.checking
        }
        blocks={2}
      />
    </div>
  );
}
