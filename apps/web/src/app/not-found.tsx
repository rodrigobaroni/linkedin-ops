import { Button, EmptyState } from "@linkedin-ops/ui";
import Link from "next/link";
import { messages } from "@/i18n/pt-br";

export default function NotFound() {
  return (
    <main
      id="conteudo-principal"
      className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-4 py-10 sm:px-6"
    >
      <h1 className="text-2xl font-bold leading-8">{messages.notFound.title}</h1>
      <EmptyState
        title={messages.notFound.title}
        description={messages.notFound.description}
        actions={
          <Button asChild>
            <Link href="/hoje">{messages.states.backToToday}</Link>
          </Button>
        }
      />
    </main>
  );
}
