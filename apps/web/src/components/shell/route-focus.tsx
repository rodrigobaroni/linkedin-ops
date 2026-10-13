"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { MAIN_CONTENT_ID } from "./skip-link";

/**
 * After a client-side navigation, move focus to the page `h1` (accessibility.md "Foco e comportamento
 * após ações"). Skipped on the first render so the initial focus stays at the top of the document.
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
    const heading = main?.querySelector<HTMLElement>("h1");
    (heading ?? main)?.focus({ preventScroll: false });
  }, [pathname]);

  return null;
}
