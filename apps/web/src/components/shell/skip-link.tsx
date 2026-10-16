import { messages } from "@/i18n/pt-br";

export const MAIN_CONTENT_ID = "conteudo-principal";

/** First focusable control of the document (accessibility.md 2.4.1). */
export function SkipLink() {
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      className="sr-only z-[60] rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
    >
      {messages.skipLink}
    </a>
  );
}
