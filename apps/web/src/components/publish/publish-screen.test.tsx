import { IDEMPOTENCY_KEY_HEADER } from "@linkedin-ops/contracts";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/pt-br";
import { LINKEDIN_POST_MAX_LENGTH } from "@/lib/api";
import { formatClock } from "@/lib/format-duration";
import { MOCK_CREDENTIALS, problemResponse } from "@/mocks/auth-handlers";
import { server } from "@/mocks/node";
import {
  MOCK_AUTHORIZE_URL,
  MOCK_MEMBER_NAME,
  MOCK_MEMBER_URN,
  mockPublishingState,
  resetMockPublishing,
} from "@/mocks/publishing-handlers";
import { formatViolations, runAxe } from "@/test/axe";
import { resetNavigation, routerMock, setPathname, setSearch } from "@/test/next-navigation";
import { renderApp } from "@/test/render";
import { PublishScreen, callbackNotice } from "./publish-screen";

vi.mock("next/navigation", async () => (await import("@/test/next-navigation")).navigationMock);

const copy = messages.publish;
const PUBLISH_URL = "/api/v1/publications/publish-now";

/** Idempotency keys seen by the API for publish-now, in order (including requests that failed). */
function recordPublishKeys(): string[] {
  const keys: string[] = [];
  const listener = ({ request }: { request: Request }) => {
    if (new URL(request.url).pathname === PUBLISH_URL) {
      keys.push(request.headers.get(IDEMPOTENCY_KEY_HEADER) ?? "");
    }
  };
  server.events.on("request:start", listener);
  return keys;
}

async function renderPublish(
  options: { elevated?: boolean; navigate?: (url: string) => void } = {},
) {
  const user = userEvent.setup();
  const view = await renderApp(<PublishScreen navigate={options.navigate} />, {
    elevated: options.elevated ?? true,
  });
  await screen.findByText(copy.connection.connectedAs(MOCK_MEMBER_NAME));
  return { user, ...view };
}

/**
 * axe over the whole document, so portalled dialogs are included. `region` is off only because the screen is
 * rendered here without the app shell, whose `<main>` holds it in the real page.
 */
async function expectAccessible(node: Element = document.body) {
  const results = await runAxe(node, { rules: { region: { enabled: false } } });
  expect(results.violations, formatViolations(results)).toEqual([]);
}

async function writeAndConfirm(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(screen.getByLabelText(copy.composer.label), text);
  await user.click(screen.getByRole("button", { name: copy.action.publishNow }));
  const dialog = await screen.findByRole("dialog", { name: copy.confirm.title });
  return dialog;
}

describe("PublishScreen", () => {
  beforeEach(() => {
    resetNavigation();
    setPathname("/publicar");
  });

  afterEach(() => {
    server.events.removeAllListeners();
  });

  it("shows the connected account, token expiry and an accessible empty composer", async () => {
    const { container } = await renderPublish();
    expect(screen.getByText(/Acesso válido até/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: copy.connection.disconnect })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: copy.action.publishNow })).toBeDisabled();
    expect(screen.getByText(copy.action.needsText)).toBeInTheDocument();
    expect(await screen.findByText(copy.recent.empty)).toBeInTheDocument();
    const results = await runAxe(container);
    expect(results.violations, formatViolations(results)).toEqual([]);
  });

  it("counts characters, blocks over 3000 and previews the text escaped (no HTML)", async () => {
    const { user } = await renderPublish();
    const textarea = screen.getByLabelText(copy.composer.label);
    await user.type(textarea, "<b>oi</b><img src=x onerror=alert(1)>");
    const preview = screen.getByTestId("publish-preview");
    expect(preview).toHaveTextContent("<b>oi</b><img src=x onerror=alert(1)>");
    expect(preview.querySelector("b, img")).toBeNull();
    expect(screen.getByTestId("publish-counter")).toHaveTextContent(
      copy.composer.counter(37, LINKEDIN_POST_MAX_LENGTH),
    );
    expect(textarea).toHaveAccessibleDescription(
      expect.stringContaining(copy.composer.counter(37, LINKEDIN_POST_MAX_LENGTH)),
    );

    await user.clear(textarea);
    await user.click(textarea);
    await user.paste("a".repeat(LINKEDIN_POST_MAX_LENGTH + 2));
    expect(
      screen.getByText(copy.composer.overLimit(2, LINKEDIN_POST_MAX_LENGTH)),
    ).toBeInTheDocument();
    expect(textarea).toBeInvalid();
    expect(screen.getByRole("button", { name: copy.action.publishNow })).toBeDisabled();
  });

  it("confirms account + final text, asks for the password, then publishes once and lists it", async () => {
    const keys = recordPublishKeys();
    const { user } = await renderPublish({ elevated: false });
    const dialog = await writeAndConfirm(user, "  Meu primeiro post pelo LinkedIn Ops.  ");
    expect(within(dialog).getByTestId("confirm-account")).toHaveTextContent(MOCK_MEMBER_NAME);
    expect(within(dialog).getByTestId("confirm-text")).toHaveTextContent(
      "Meu primeiro post pelo LinkedIn Ops.",
    );
    await expectAccessible();
    await user.click(within(dialog).getByRole("button", { name: copy.confirm.confirm }));

    const reauth = await screen.findByRole("dialog", { name: messages.auth.reauth.title });
    await expectAccessible();
    await user.type(within(reauth).getByLabelText(/^Senha/), MOCK_CREDENTIALS.password);
    await user.click(within(reauth).getByRole("button", { name: messages.auth.reauth.confirm }));

    expect(await screen.findByText(copy.result.published)).toBeInTheDocument();
    await expectAccessible();
    const link = screen.getByRole("link", { name: new RegExp(copy.result.viewPost) });
    expect(link).toHaveAttribute(
      "href",
      expect.stringMatching(/^https:\/\/www\.linkedin\.com\/feed\/update\/urn:li:share:/),
    );
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByLabelText(copy.composer.label)).toHaveValue("");
    expect(mockPublishingState().linkedinCalls).toBe(1);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);

    expect(await screen.findByText(copy.recent.status.SUCCEEDED)).toBeInTheDocument();
    expect(screen.getByText("Meu primeiro post pelo LinkedIn Ops.")).toBeInTheDocument();
  });

  it("ACTIVE without memberName: identifies the account by its URN on the card and the confirmation", async () => {
    resetMockPublishing({ memberName: null });
    const user = userEvent.setup();
    await renderApp(<PublishScreen />, { elevated: true });
    expect(
      await screen.findByText(copy.connection.connectedAs(MOCK_MEMBER_URN)),
    ).toBeInTheDocument();
    const dialog = await writeAndConfirm(user, "Post");
    expect(within(dialog).getByTestId("confirm-account")).toHaveTextContent(MOCK_MEMBER_URN);
  });

  it("ACTIVE without memberName and memberUrn: blocks publishing and offers reconnection", async () => {
    resetMockPublishing({ memberName: null, memberUrn: null });
    const keys = recordPublishKeys();
    const user = userEvent.setup();
    await renderApp(<PublishScreen />, { elevated: true });
    expect(await screen.findByText(copy.connection.unidentified)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: copy.connection.reconnect })).toBeInTheDocument();
    await user.type(screen.getByLabelText(copy.composer.label), "Post sem conta identificada");
    expect(screen.getByRole("button", { name: copy.action.publishNow })).toBeDisabled();
    expect(screen.getByText(copy.action.needsIdentity)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(keys).toHaveLength(0);
  });

  it("lost response after the post went out: warns it is unconfirmed and a manual re-send replays it", async () => {
    const keys = recordPublishKeys();
    // The API publishes (effect persisted under the key) and then the response is lost on the way back.
    server.use(
      http.post(
        PUBLISH_URL,
        async ({ request }) => {
          await fetch(request.clone());
          return HttpResponse.error();
        },
        { once: true },
      ),
    );
    const { user } = await renderPublish();
    const dialog = await writeAndConfirm(user, "Post com rede instável");
    await user.click(within(dialog).getByRole("button", { name: copy.confirm.confirm }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(copy.result.ambiguousTitle);
    expect(alert).toHaveTextContent(copy.result.unconfirmed);
    expect(alert).not.toHaveTextContent(/nada foi publicado/i);
    expect(screen.getByLabelText(copy.composer.label)).toHaveValue("Post com rede instável");
    expect(mockPublishingState().linkedinCalls).toBe(1);
    await expectAccessible();

    await user.click(screen.getByRole("button", { name: copy.result.resendSame }));
    expect(await screen.findByText(copy.result.published)).toBeInTheDocument();
    expect(keys.length).toBeGreaterThanOrEqual(2);
    expect(new Set(keys).size).toBe(1);
    expect(mockPublishingState().linkedinCalls).toBe(1);
    expect(mockPublishingState().publications).toHaveLength(1);
  });

  it("5xx after sending is unconfirmed too, never 'not published'", async () => {
    const keys = recordPublishKeys();
    server.use(
      http.post(PUBLISH_URL, () => problemResponse("UPSTREAM_UNAVAILABLE"), { once: true }),
    );
    const { user } = await renderPublish();
    const dialog = await writeAndConfirm(user, "Post com 503");
    await user.click(within(dialog).getByRole("button", { name: copy.confirm.confirm }));
    expect(await screen.findByText(copy.result.unconfirmed)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: copy.result.resendSame }));
    expect(await screen.findByText(copy.result.published)).toBeInTheDocument();
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
    expect(mockPublishingState().linkedinCalls).toBe(1);
  });

  it("uses a new key for a new text after a definitive answer", async () => {
    const keys = recordPublishKeys();
    const { user } = await renderPublish();
    let dialog = await writeAndConfirm(user, "Primeiro");
    await user.click(within(dialog).getByRole("button", { name: copy.confirm.confirm }));
    await screen.findByText(copy.result.published);
    dialog = await writeAndConfirm(user, "Segundo");
    await user.click(within(dialog).getByRole("button", { name: copy.confirm.confirm }));
    await waitFor(() => expect(mockPublishingState().linkedinCalls).toBe(2));
    expect(keys[1]).not.toBe(keys[0]);
  });

  it("AMBIGUOUS: warns to check the profile and offers no retry", async () => {
    resetMockPublishing({ nextOutcome: "AMBIGUOUS" });
    const { user } = await renderPublish();
    const dialog = await writeAndConfirm(user, "Post incerto");
    await user.click(within(dialog).getByRole("button", { name: copy.confirm.confirm }));
    expect(await screen.findByText(copy.result.ambiguousTitle)).toBeInTheDocument();
    await expectAccessible();
    expect(screen.queryByRole("button", { name: copy.result.resendSame })).not.toBeInTheDocument();
  });

  it("FAILED: explains, keeps the text, moves focus to the result and offers no re-send", async () => {
    resetMockPublishing({ nextOutcome: "FAILED" });
    const keys = recordPublishKeys();
    const { user } = await renderPublish();
    const dialog = await writeAndConfirm(user, "Post recusado");
    await user.click(within(dialog).getByRole("button", { name: copy.confirm.confirm }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(copy.result.failedTitle);
    expect(alert).toHaveTextContent(copy.errors.linkedinRejected);
    await waitFor(() => expect(alert.parentElement).toHaveFocus());
    expect(screen.getByLabelText(copy.composer.label)).toHaveValue("Post recusado");
    expect(screen.queryByRole("button", { name: copy.result.resendSame })).not.toBeInTheDocument();
    await expectAccessible();

    // A definitive answer drops the key: publishing again is a new attempt.
    await user.click(screen.getByRole("button", { name: copy.action.publishNow }));
    const again = await screen.findByRole("dialog", { name: copy.confirm.title });
    await user.click(within(again).getByRole("button", { name: copy.confirm.confirm }));
    await waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[1]).not.toBe(keys[0]);
  });

  it("409 IDEMPOTENCY_KEY_CONFLICT: explains and offers no re-send", async () => {
    server.use(
      http.post(PUBLISH_URL, () => problemResponse("IDEMPOTENCY_KEY_CONFLICT"), { once: true }),
    );
    const { user } = await renderPublish();
    const dialog = await writeAndConfirm(user, "Post em conflito");
    await user.click(within(dialog).getByRole("button", { name: copy.confirm.confirm }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(copy.errors.IDEMPOTENCY_KEY_CONFLICT);
    await waitFor(() => expect(alert.parentElement).toHaveFocus());
    expect(screen.queryByRole("button", { name: copy.result.resendSame })).not.toBeInTheDocument();
    expect(mockPublishingState().linkedinCalls).toBe(0);
  });

  it("429 RATE_LIMITED with Retry-After: says when to try again, nothing published, no re-send", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-21T22:00:00Z"));
    server.use(
      http.post(
        PUBLISH_URL,
        () => problemResponse("RATE_LIMITED", { headers: { "Retry-After": "600" } }),
        { once: true },
      ),
    );
    const { user } = await renderPublish();
    const dialog = await writeAndConfirm(user, "Post demais");
    await user.click(within(dialog).getByRole("button", { name: copy.confirm.confirm }));
    const until = Date.parse("2026-10-21T22:10:00Z");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(copy.result.rateLimitedUntil(formatClock(until), 10));
    await waitFor(() => expect(alert.parentElement).toHaveFocus());
    expect(screen.queryByRole("button", { name: copy.result.resendSame })).not.toBeInTheDocument();
    expect(mockPublishingState().linkedinCalls).toBe(0);
    await expectAccessible();
    vi.restoreAllMocks();
  });

  it("LinkedIn 401 on publish: explains and points to reconnection", async () => {
    resetMockPublishing({ nextOutcome: "LINKEDIN_401" });
    const { user } = await renderPublish();
    const dialog = await writeAndConfirm(user, "Post com token revogado");
    await user.click(within(dialog).getByRole("button", { name: copy.confirm.confirm }));
    expect(await screen.findByText(copy.errors.LINKEDIN_REAUTH_REQUIRED)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: copy.connection.reconnect })).toHaveAttribute(
      "href",
      "#linkedin-connection",
    );
    // The connection card refreshes to the reconnect state.
    expect(
      await screen.findByText(copy.connection.reauthRequired, { exact: false }),
    ).toBeInTheDocument();
  });

  it("412 LINKEDIN_REAUTH_REQUIRED from the API maps to the reconnection message", async () => {
    server.use(http.post(PUBLISH_URL, () => problemResponse("LINKEDIN_REAUTH_REQUIRED")));
    const { user } = await renderPublish();
    const dialog = await writeAndConfirm(user, "Post");
    await user.click(within(dialog).getByRole("button", { name: copy.confirm.confirm }));
    expect(await screen.findByText(copy.errors.LINKEDIN_REAUTH_REQUIRED)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: copy.result.resendSame })).not.toBeInTheDocument();
  });

  it("EXPIRED: shows expiry and reconnects through reauth to LinkedIn's authorize URL", async () => {
    resetMockPublishing({
      status: "EXPIRED",
      accessExpiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const navigate = vi.fn();
    const user = userEvent.setup();
    await renderApp(<PublishScreen navigate={navigate} />, { elevated: false });
    expect(await screen.findByText(copy.connection.expired, { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/O acesso expirou em/)).toBeInTheDocument();
    expect(screen.getByText(copy.action.needsConnection)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: copy.connection.reconnect }));
    const reauth = await screen.findByRole("dialog", { name: messages.auth.reauth.title });
    await user.type(within(reauth).getByLabelText(/^Senha/), MOCK_CREDENTIALS.password);
    await user.click(within(reauth).getByRole("button", { name: messages.auth.reauth.confirm }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(MOCK_AUTHORIZE_URL));
  });

  it("never navigates to a non-LinkedIn authorize URL", async () => {
    resetMockPublishing({ status: "DISCONNECTED" });
    server.use(
      http.post("/api/v1/integrations/linkedin/connect", () =>
        HttpResponse.json({ authorizeUrl: "https://evil.example.com/authorize" }),
      ),
    );
    const navigate = vi.fn();
    const user = userEvent.setup();
    await renderApp(<PublishScreen navigate={navigate} />, { elevated: true });
    await user.click(await screen.findByRole("button", { name: copy.connection.connect }));
    expect(await screen.findByText(copy.connection.invalidAuthorizeUrl)).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("disconnects (🔐), shows the disconnected state and refreshes the session's LinkedIn status", async () => {
    const meRequests: string[] = [];
    server.events.on("request:start", ({ request }) => {
      if (new URL(request.url).pathname === "/api/v1/auth/me") meRequests.push(request.url);
    });
    const { user } = await renderPublish();
    const before = meRequests.length;
    await user.click(screen.getByRole("button", { name: copy.connection.disconnect }));
    expect(await screen.findByText(copy.connection.disconnected)).toBeInTheDocument();
    expect(mockPublishingState().status).toBe("DISCONNECTED");
    await waitFor(() => expect(meRequests.length).toBeGreaterThan(before));
    const me = await fetch("/api/v1/auth/me").then((response) => response.json());
    expect(me).toMatchObject({ linkedinConnected: false });
  });

  describe("reauth cancelled returns focus to the button that started it", () => {
    type User = ReturnType<typeof userEvent.setup>;
    const cancels: [string, (user: User) => Promise<void>][] = [
      ["Escape", (user) => user.keyboard("{Escape}")],
      [
        "Cancelar",
        (user) => user.click(screen.getByRole("button", { name: messages.auth.reauth.cancel })),
      ],
    ];

    // `fireEvent.click` does not move focus, like WebKit (the Maestri portal, Safari) on a button click:
    // the trigger must come from the click itself, not from `document.activeElement`.
    async function cancelReauth(user: User, cancel: (user: User) => Promise<void>) {
      await screen.findByRole("dialog", { name: messages.auth.reauth.title });
      await cancel(user);
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    }

    it.each(cancels)("Desconectar, %s", async (_how, cancel) => {
      const { user } = await renderPublish({ elevated: false });
      fireEvent.click(screen.getByRole("button", { name: copy.connection.disconnect }));
      await cancelReauth(user, cancel);
      await waitFor(() =>
        expect(screen.getByRole("button", { name: copy.connection.disconnect })).toHaveFocus(),
      );
      expect(mockPublishingState().status).toBe("ACTIVE");
    });

    it.each(cancels)("Conectar, %s", async (_how, cancel) => {
      resetMockPublishing({ status: "DISCONNECTED" });
      const navigate = vi.fn();
      const user = userEvent.setup();
      await renderApp(<PublishScreen navigate={navigate} />, { elevated: false });
      fireEvent.click(await screen.findByRole("button", { name: copy.connection.connect }));
      await cancelReauth(user, cancel);
      await waitFor(() =>
        expect(screen.getByRole("button", { name: copy.connection.connect })).toHaveFocus(),
      );
      expect(navigate).not.toHaveBeenCalled();
    });

    it.each(cancels)(
      "Publicar agora, %s (status announced, focus not stolen)",
      async (_how, cancel) => {
        const keys = recordPublishKeys();
        const { user } = await renderPublish({ elevated: false });
        await user.type(screen.getByLabelText(copy.composer.label), "Post cancelado");
        fireEvent.click(screen.getByRole("button", { name: copy.action.publishNow }));
        const dialog = await screen.findByRole("dialog", { name: copy.confirm.title });
        fireEvent.click(within(dialog).getByRole("button", { name: copy.confirm.confirm }));
        await cancelReauth(user, cancel);
        expect(await screen.findByText(copy.result.cancelled)).toBeInTheDocument();
        await waitFor(() =>
          expect(screen.getByRole("button", { name: copy.action.publishNow })).toHaveFocus(),
        );
        expect(keys).toHaveLength(0);
      },
    );
  });

  it("connection status fails to load: offers Tentar novamente, which recovers", async () => {
    // Fails the first load and its automatic retry (`retry: 1`), then recovers.
    let failures = 2;
    server.use(
      http.get("/api/v1/integrations/linkedin", () =>
        failures-- > 0 ? problemResponse("INTERNAL") : undefined,
      ),
    );
    const user = userEvent.setup();
    const { container } = await renderApp(<PublishScreen />, { elevated: true });
    // The automatic retry waits ~1 s before failing for good.
    expect(
      await screen.findByText(copy.connection.loadError, {}, { timeout: 4000 }),
    ).toBeInTheDocument();
    const results = await runAxe(container);
    expect(results.violations, formatViolations(results)).toEqual([]);
    await user.click(screen.getByRole("button", { name: copy.connection.retry }));
    expect(
      await screen.findByText(copy.connection.connectedAs(MOCK_MEMBER_NAME)),
    ).toBeInTheDocument();
  });

  it("shows the OAuth callback notice and removes the parameter from the URL", async () => {
    setSearch("linkedin=connected");
    await renderPublish();
    expect(screen.getByText(copy.callback.connected)).toBeInTheDocument();
    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith("/publicar", { scroll: false }),
    );
  });

  it("shows the callback error reason and removes both parameters, keeping the others", async () => {
    setSearch("linkedin=error&reason=invalid_state&outro=1");
    await renderPublish();
    expect(screen.getByRole("alert")).toHaveTextContent(copy.callback.reasons.invalid_state);
    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith("/publicar?outro=1", { scroll: false }),
    );
  });
});

describe("callbackNotice", () => {
  it("maps each known reason and never echoes URL content", () => {
    expect(callbackNotice(null, null)).toBeNull();
    expect(callbackNotice("connected", null)).toEqual({
      kind: "success",
      message: copy.callback.connected,
    });
    expect(callbackNotice("error", "denied")).toEqual({
      kind: "info",
      message: copy.callback.denied,
    });
    for (const reason of [
      "expired",
      "invalid_state",
      "exchange_failed",
      "unavailable",
      "scope_missing",
    ] as const) {
      expect(callbackNotice("error", reason)).toEqual({
        kind: "error",
        message: copy.callback.reasons[reason],
      });
    }
    expect(callbackNotice("error", "<script>x</script>")?.message).toBe(copy.callback.failed);
    expect(callbackNotice("error", "toString")?.message).toBe(copy.callback.failed);
    expect(callbackNotice("error", null)?.message).toBe(copy.callback.failed);
  });
});
