import { vi } from "vitest";

/**
 * Shared `next/navigation` mock. In a test file:
 *   vi.mock("next/navigation", async () => (await import("@/test/next-navigation")).navigationMock);
 * Then set the current route with `setPathname`.
 */
export const navigationState = { pathname: "/hoje" };
export const routerMock = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() };

export function setPathname(pathname: string) {
  navigationState.pathname = pathname;
}

export const navigationMock = {
  usePathname: () => navigationState.pathname,
  useRouter: () => routerMock,
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn(),
  notFound: vi.fn(),
};
