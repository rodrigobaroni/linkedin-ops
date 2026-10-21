import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/pt-br";
import { MOCK_CREDENTIALS, mockAuthState } from "@/mocks/auth-handlers";
import { resetNavigation, routerMock, setPathname, setSearch } from "@/test/next-navigation";
import { renderApp } from "@/test/render";
import { LoginScreen } from "./login-screen";

vi.mock("next/navigation", async () => (await import("@/test/next-navigation")).navigationMock);

describe("LoginScreen", () => {
  beforeEach(() => {
    resetNavigation();
    setPathname("/login");
  });

  it("logs in and returns to the preserved destination", async () => {
    setSearch("next=%2Fcuradoria%3Fx%3D1");
    await renderApp(<LoginScreen />, { loggedIn: false });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/E-mail/), MOCK_CREDENTIALS.email);
    await user.type(screen.getByLabelText(/Senha/), MOCK_CREDENTIALS.password);
    await user.click(screen.getByRole("button", { name: messages.auth.login.submit }));
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith("/curadoria?x=1"));
    expect(mockAuthState().loggedIn).toBe(true);
  });

  it("ignores an external next and lands on /hoje", async () => {
    setSearch("next=https%3A%2F%2Fevil.example%2F");
    await renderApp(<LoginScreen />, { loggedIn: false });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/E-mail/), MOCK_CREDENTIALS.email);
    await user.type(screen.getByLabelText(/Senha/), MOCK_CREDENTIALS.password);
    await user.click(screen.getByRole("button", { name: messages.auth.login.submit }));
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith("/hoje"));
  });

  it("redirects an already authenticated visitor without showing the form", async () => {
    await renderApp(<LoginScreen />, { loggedIn: true });
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith("/hoje"));
    expect(
      screen.queryByRole("button", { name: messages.auth.login.submit }),
    ).not.toBeInTheDocument();
  });
});
