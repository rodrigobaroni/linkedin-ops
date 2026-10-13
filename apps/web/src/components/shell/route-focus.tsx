"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { MAIN_CONTENT_ID } from "./skip-link";

/**
 * After a client-side navigation, move focus to the page `h1` (accessibility.md "Foco e comportamento
 * após ações"). Skipped on the first render so the initial focus stays at the top of the document.
 * With `loading.tsx` the pathname commits while the skeleton is shown, so when no `h1` exists yet we
 * watch `main` and focus the heading as soon as it streams in.
 */
export function RouteFocus() {
  const pathname = usePathname();
  const previous = useRef<string | null>(null);

  useEffect(() => {
    if (previous.current === null) {
      previous.current = pathname;
      return;
    }
    if (previous.current === pathname) return;
    previous.current = pathname;

    const main = document.getElementById(MAIN_CONTENT_ID);
    if (!main) return;

    const focusHeading = () => {
      const heading = main.querySelector<HTMLElement>("h1");
      if (!heading) return false;
      heading.focus();
      return true;
    };

    if (focusHeading()) return;
    main.focus();
    const observer = new MutationObserver(() => {
      if (focusHeading()) observer.disconnect();
    });
    observer.observe(main, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
