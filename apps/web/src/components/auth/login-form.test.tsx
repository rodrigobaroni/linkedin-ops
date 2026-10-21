import { act, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/pt-br";
import { ApiNetworkError, ApiProblem } from "@/lib/api";
import { formatViolations, runAxe } from "@/test/axe";
import { LoginForm } from "./login-form";

const copy = messages.auth.login;

function problem(
  code: "AUTH_INVALID_CREDENTIALS" | "RATE_LIMITED" | "INTERNAL",
  retryAfterSeconds?: number,
) {
  const status = { AUTH_INVALID_CREDENTIALS: 401, RATE_LIMITED: 429, INTERNAL: 500 }[code];
  return new ApiProblem({ code, status, title: code, retryAfterSeconds });
}

function setup(onSubmit = vi.fn<(values: { email: string; password: string }) => Promise<void>>()) {
  const view = render(<LoginForm onSubmit={onSubmit} />);
  return {
    ...view,
    onSubmit,
    email: screen.getByLabelText(/E-mail/),
    password: screen.getByLabelText(/Senha/),
    submit: screen.getByRole("button", { name: copy.submit }),
  };
}

async function fill(
  user: ReturnType<typeof userEvent.setup>,
  email: HTMLElement,
  password: HTMLElement,
) {
  await user.type(email, "rodrigo@example.com");
  await user.type(password, "linkedin-ops-dev-password");
}

describe("LoginForm", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is accessible in the idle state and accepts password managers", async () => {
    const { container, email, password } = setup();
    expect(email).toHaveAttribute("autocomplete", "username");
    expect(email).toHaveAttribute("type", "email");
    expect(password).toHaveAttribute("autocomplete", "current-password");
    expect(password).toHaveAttribute("type", "password");
    expect(email).toBeRequired();
    const results = await runAxe(container);
    expect(results.violations, formatViolations(results)).toEqual([]);
  });

  it("validates presence and e-mail shape before calling the API", async () => {
    const user = userEvent.setup();
    const { onSubmit, email, submit } = setup();
    await user.click(submit);
    expect(await screen.findByText(copy.emailRequired)).toBeInTheDocument();
    expect(screen.getByText(copy.passwordRequired)).toBeInTheDocument();
    expect(email).toBeInvalid();
    expect(onSubmit).not.toHaveBeenCalled();

    await user.type(email, "not-an-email");
    await user.click(submit);
    expect(await screen.findByText(copy.emailInvalid)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows the submitting state and passes trimmed values", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const onSubmit = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
    const { email, password, submit } = setup(onSubmit);
    await user.type(email, "  rodrigo@example.com ");
    await user.type(password, "linkedin-ops-dev-password");
    await user.click(submit);
    expect(await screen.findByRole("button", { name: copy.submitting })).toBeDisabled();
    expect(screen.getByRole("button", { name: copy.submitting })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(onSubmit).toHaveBeenCalledWith({
      email: "rodrigo@example.com",
      password: "linkedin-ops-dev-password",
    });
    await act(async () => release());
  });

  it("keeps the fields and announces a generic error on invalid credentials", async () => {
    const user = userEvent.setup();
    const { container, email, password, submit } = setup(
      vi.fn(() => Promise.reject(problem("AUTH_INVALID_CREDENTIALS"))),
    );
    await fill(user, email, password);
    await user.click(submit);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(copy.invalidCredentials);
    expect(email).toHaveValue("rodrigo@example.com");
    expect(password).toHaveValue("linkedin-ops-dev-password");
    expect(screen.getByRole("button", { name: copy.submit })).toBeEnabled();
    const results = await runAxe(container);
    expect(results.violations, formatViolations(results)).toEqual([]);
  });

  it("explains network failures and unexpected errors", async () => {
    const user = userEvent.setup();
    const onSubmit = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new ApiNetworkError(new TypeError("Failed to fetch")))
      .mockRejectedValueOnce(problem("INTERNAL"));
    const { email, password, submit } = setup(onSubmit);
    await fill(user, email, password);
    await user.click(submit);
    expect(await screen.findByRole("alert")).toHaveTextContent(copy.networkError);
    await user.click(screen.getByRole("button", { name: copy.submit }));
    expect(await screen.findByRole("alert")).toHaveTextContent(copy.unexpectedError);
  });

  it("locks the form on 429 with a countdown from Retry-After and releases it at zero", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { email, password, submit } = setup(
      vi.fn(() => Promise.reject(problem("RATE_LIMITED", 90))),
    );
    await fill(user, email, password);
    await user.click(submit);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(copy.rateLimitedTitle);
    expect(screen.getByTestId("login-lock-countdown")).toHaveTextContent("01:30");
    expect(screen.getByTestId("login-lock-countdown")).toHaveAttribute("aria-live", "off");
    expect(screen.getByRole("button", { name: copy.submit })).toBeDisabled();

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByTestId("login-lock-countdown")).toHaveTextContent("01:00");

    await act(async () => {
      vi.advanceTimersByTime(61_000);
    });
    expect(screen.queryByTestId("login-lock-countdown")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(copy.rateLimitReleased);
    expect(screen.getByRole("button", { name: copy.submit })).toBeEnabled();
  });

  it("falls back to 15 minutes without Retry-After", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { email, password, submit } = setup(vi.fn(() => Promise.reject(problem("RATE_LIMITED"))));
    await fill(user, email, password);
    await user.click(submit);
    expect(await screen.findByTestId("login-lock-countdown")).toHaveTextContent("15:00");
  });
});
