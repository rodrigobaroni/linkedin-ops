"use client";

import { LoadingState } from "@linkedin-ops/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { messages } from "@/i18n/pt-br";
import { NEXT_PARAM, safeNextPath } from "@/lib/next-path";
import { useAuth } from "@/providers/auth-provider";
import { LoginForm } from "./login-form";

/**
 * `/login`: an authenticated visitor is sent to `next` (validated) or `/hoje`; otherwise the form is shown.
 * While the session is unknown the form is still rendered (no flash of a blank page), and the redirect
 * happens as soon as `GET /auth/me` answers.
 */
export function LoginScreen() {
  const { status, login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const destination = safeNextPath(searchParams.get(NEXT_PARAM));

  useEffect(() => {
    if (status === "authenticated") router.replace(destination);
  }, [status, destination, router]);

  if (status === "authenticated") {
    return <LoadingState label={messages.auth.session.redirecting} blocks={1} />;
  }

  return (
    <LoginForm
      onSubmit={async (values) => {
        await login(values);
        router.replace(destination);
      }}
    />
  );
}
