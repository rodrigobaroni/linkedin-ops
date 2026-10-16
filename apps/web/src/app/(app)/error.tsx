"use client";

import { Button, ErrorState } from "@linkedin-ops/ui";
import Link from "next/link";
import { useEffect } from "react";
import { messages } from "@/i18n/pt-br";

/** Segment error boundary: explains, preserves the shell and offers recovery (screen-states.md). */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Client-side log only; the error itself may be reported to the API with T-054 (observability).
    console.error(error);
  }, [error]);

  return (
    <div className="py-6">
      <ErrorState
        title={messages.states.unexpectedErrorTitle}
        description={messages.states.unexpectedErrorDescription}
        correlationId={error.digest}
        actions={
          <>
            <Button onClick={reset}>{messages.states.retry}</Button>
            <Button asChild variant="outline">
              <Link href="/hoje">{messages.states.backToToday}</Link>
            </Button>
          </>
        }
      />
    </div>
  );
}
