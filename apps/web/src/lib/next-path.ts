import type { Route } from "next";

export const LOGIN_PATH = "/login" satisfies Route;
export const HOME_PATH = "/hoje" satisfies Route;
export const NEXT_PARAM = "next";

/**
 * Accepts only a same-origin, relative destination for the post-login redirect: starts with a single
 * `/`, no `//`, `/\` or scheme, never `/login` itself. Anything else falls back to `/hoje`
 * (navigation-map.md "Links profundos exigem sessão e retornam ao destino original").
 */
export function safeNextPath(raw: string | null | undefined, fallback: Route = HOME_PATH): Route {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return fallback;
  }
  let url: URL;
  try {
    url = new URL(raw, "http://localhost");
  } catch {
    return fallback;
  }
  if (url.origin !== "http://localhost" || url.pathname === LOGIN_PATH) return fallback;
  return `${url.pathname}${url.search}` as Route;
}

/** `/login?next=<encoded destination>`; the destination is omitted when it is the home or unsafe. */
export function loginHref(destination: string | null | undefined): Route {
  const next = safeNextPath(destination);
  if (next === HOME_PATH) return LOGIN_PATH;
  return `${LOGIN_PATH}?${NEXT_PARAM}=${encodeURIComponent(next)}` as Route;
}
