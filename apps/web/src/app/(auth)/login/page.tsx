import { Card, CardContent, CardDescription, CardHeader } from "@linkedin-ops/ui";
import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginScreen } from "@/components/auth/login-screen";
import { messages } from "@/i18n/pt-br";

export const metadata: Metadata = { title: messages.auth.login.title };

/**
 * Public page outside the shell: no sidebar, bottom bar, breadcrumb or autonomy badge (Aurora spec
 * items 1–3). Mobile-first: full-width card with 24 px padding, capped at 420 px on larger screens.
 */
export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background p-6">
      <Card className="w-full gap-6 py-6 sm:max-w-[420px]">
        <CardHeader className="gap-2 px-6">
          <p className="text-sm font-semibold leading-5 text-primary">{messages.app.name}</p>
          <h1 className="text-2xl font-bold leading-8 text-foreground">
            {messages.auth.login.title}
          </h1>
          <CardDescription>{messages.auth.login.description}</CardDescription>
        </CardHeader>
        <CardContent className="px-6">
          {/* `useSearchParams` needs a Suspense boundary for static rendering of the page. */}
          <Suspense fallback={null}>
            <LoginScreen />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
