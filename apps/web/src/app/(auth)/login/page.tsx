import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginScreen } from "@/components/auth/login-screen";
import { messages } from "@/i18n/pt-br";

export const metadata: Metadata = { title: messages.auth.login.title };

/** Public page outside the shell: no sidebar, no session required. */
export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-8 sm:px-6">
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-lg border bg-card p-6 shadow-xs sm:p-8">
        <header className="flex flex-col gap-2">
          <p className="text-sm font-semibold leading-5 text-primary">{messages.app.name}</p>
          <h1 className="text-2xl font-bold leading-8 text-foreground">
            {messages.auth.login.title}
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            {messages.auth.login.description}
          </p>
        </header>
        {/* `useSearchParams` needs a Suspense boundary for static rendering of the page. */}
        <Suspense fallback={null}>
          <LoginScreen />
        </Suspense>
      </div>
    </main>
  );
}
