import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/pt-br";
import { server } from "@/mocks/node";
import { resetNavigation, routerMock, setPathname, setSearch } from "@/test/next-navigation";
import { renderApp } from "@/test/render";
import { RequireSession } from "./require-session";

vi.mock("next/navigation", async () => (await import("@/test/next-navigation")).navigationMock);

const CHILD = <p>Conteúdo protegido</p>;

describe("RequireSession", () => {
  beforeEach(() => {
    resetNavigation();
  });

  it("renders the children once the session is confirmed", async () => {
    setPathname("/curadoria");
    await renderApp(<RequireSession>{CHILD}</RequireSession>, { loggedIn: true });
    expect(screen.getByText("Conteúdo protegido")).toBeInTheDocument();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it("shows a loading state while checking, never the children", async () => {
    setPathname("/curadoria");
    await renderApp(<RequireSession>{CHILD}</RequireSession>, { loggedIn: false, settle: false });
    expect(screen.getByRole("status")).toHaveTextContent(messages.auth.session.checking);
    expect(screen.queryByText("Conteúdo protegido")).not.toBeInTheDocument();
  });

  it("redirects anonymous visitors to /login preserving path and query", async () => {
    setPathname("/estudio/abc");
    setSearch("aba=preview");
    await renderApp(<RequireSession>{CHILD}</RequireSession>, { loggedIn: false });
    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith(
        "/login?next=%2Festudio%2Fabc%3Faba%3Dpreview",
      ),
    );
    expect(screen.queryByText("Conteúdo protegido")).not.toBeInTheDocument();
  });

  it("uses a bare /login when the destination is the home", async () => {
    setPathname("/hoje");
    await renderApp(<RequireSession>{CHILD}</RequireSession>, { loggedIn: false });
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith("/login"));
  });

  it("explains an unavailable API and retries", async () => {
    setPathname("/curadoria");
    server.use(http.get("/api/v1/auth/me", () => HttpResponse.error()));
    await renderApp(<RequireSession>{CHILD}</RequireSession>, { loggedIn: true });
    expect(screen.getByRole("alert")).toHaveTextContent(messages.auth.session.unavailableTitle);
    expect(routerMock.replace).not.toHaveBeenCalled();

    server.resetHandlers();
    await userEvent.click(screen.getByRole("button", { name: messages.states.retry }));
    expect(await screen.findByText("Conteúdo protegido")).toBeInTheDocument();
  });
});
