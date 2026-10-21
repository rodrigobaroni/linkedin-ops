import type { Metadata } from "next";
import { Suspense } from "react";
import { PublishScreen } from "@/components/publish/publish-screen";
import { messages } from "@/i18n/pt-br";

export const metadata: Metadata = { title: messages.publish.title };

export default function Page() {
  return (
    // `useSearchParams` (OAuth callback notice) needs a Suspense boundary for static rendering.
    <Suspense fallback={null}>
      <PublishScreen />
    </Suspense>
  );
}
