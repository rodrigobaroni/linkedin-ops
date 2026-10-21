import { vi } from "vitest";

/**
 * Shared `next/navigation` mock. In a test file:
 *   vi.mock("next/navigation", async () => (await import("@/test/next-navigation")).navigationMock);
 * Then set the current route with `setPathname` and the query string with `setSearch`.
 */
export const navigationState = { pathname: "/hoje", search: "" };
export const routerMock = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() };

export function setPathname(pathname: string) {
  navigationState.pathname = pathname;
}

/** Query string without the leading `?` (e.g. `next=%2Fcuradoria`). */
export function setSearch(search: string) {
  navigationState.search = search;
}

export function resetNavigation() {
  navigationState.pathname = "/hoje";
  navigationState.search = "";
  routerMock.push.mockReset();
  routerMock.replace.mockReset();
  routerMock.back.mockReset();
  routerMock.prefetch.mockReset();
}

export const navigationMock = {
  usePathname: () => navigationState.pathname,
  useRouter: () => routerMock,
  useSearchParams: () => new URLSearchParams(navigationState.search),
  redirect: vi.fn(),
  notFound: vi.fn(),
};
