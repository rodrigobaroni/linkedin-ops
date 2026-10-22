import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/pt-br";
import { problemResponse } from "@/mocks/auth-handlers";
import {
  MOCK_CV_CONTENT,
  finishMockExtraction,
  mockActiveCv,
  mockCareerState,
  mockDraft,
  resetMockCareer,
} from "@/mocks/career-handlers";
import { MOCK_CREDENTIALS } from "@/mocks/auth-handlers";
import { server } from "@/mocks/node";
import { formatViolations, runAxe } from "@/test/axe";
import { resetNavigation, setPathname } from "@/test/next-navigation";
import { renderApp } from "@/test/render";
import { http } from "msw";
import { CareerCvScreen } from "./career-cv-screen";

vi.mock("next/navigation", async () => (await import("@/test/next-navigation")).navigationMock);

const copy = messages.career.cv;
/** Fast polling for tests (2 s in the app). */
const POLL_MS = 20;

function pdf(name = "cv.pdf"): File {
  return new File(["%PDF-1.7 fictitious"], name, { type: "application/pdf" });
}

async function renderCv(options: { elevated?: boolean } = {}) {
  const user = userEvent.setup();
  const view = await renderApp(<CareerCvScreen pollInitialMs={POLL_MS} />, {
    elevated: options.elevated ?? false,
  });
  return { user, ...view };
}

/** axe over the whole document (portalled dialogs included); `region` is the shell's job. */
async function expectAccessible() {
  const results = await runAxe(document.body, { rules: { region: { enabled: false } } });
  expect(results.violations, formatViolations(results)).toEqual([]);
}

async function pickAndRead(user: ReturnType<typeof userEvent.setup>, file = pdf()) {
  await user.upload(screen.getByLabelText(copy.upload.label), file);
  expect(screen.getByText(copy.upload.selected(file.name))).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: copy.upload.read }));
}

function sectionRegion(section: keyof typeof copy.sections) {
  return screen.getByRole("region", { name: copy.sections[section] });
}

describe("CareerCvScreen", { timeout: 20_000 }, () => {
  beforeEach(() => {
    resetNavigation();
    setPathname("/carreira/cv");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("empty: Aurora's copy, breadcrumb, persistent label described by the help, accessible", async () => {
    await renderCv();
    expect(await screen.findByRole("heading", { name: copy.empty.title })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: copy.title })).toBeInTheDocument();
    expect(screen.getByText(copy.description)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: messages.nav.home })).toHaveAttribute("href", "/hoje");
    expect(screen.getByText(messages.career.breadcrumb)).toBeInTheDocument();
    const input = screen.getByLabelText(copy.upload.label);
    expect(input).toHaveAccessibleDescription(expect.stringContaining(copy.upload.hint));
    expect(screen.getByRole("button", { name: copy.upload.start })).toHaveAccessibleDescription(
      expect.stringContaining(copy.upload.hint),
    );
    await expectAccessible();
  });

  it("refuses a non-PDF or oversized file before uploading, with the error tied to the controls", async () => {
    const { user } = await renderCv();
    await screen.findByRole("heading", { name: copy.empty.title });
    const input = screen.getByLabelText(copy.upload.label);
    // `applyAccept: false`: the browser filter can be bypassed, the check must not depend on it.
    await userEvent
      .setup({ applyAccept: false })
      .upload(input, new File(["x"], "cv.docx", { type: "application/msword" }));
    expect(screen.getByRole("alert")).toHaveTextContent(copy.upload.invalidFile);
    expect(input).toBeInvalid();
    expect(input).toHaveAccessibleDescription(expect.stringContaining(copy.upload.invalidFile));
    await user.upload(
      input,
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.pdf", { type: "application/pdf" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(copy.upload.invalidFile);
    expect(screen.queryByRole("button", { name: copy.upload.read })).not.toBeInTheDocument();
    expect(mockCareerState().uploads).toBe(0);
  });

  it("uploads, polls while EXTRACTING, then focuses the review once READY", async () => {
    const { user } = await renderCv();
    await screen.findByRole("heading", { name: copy.empty.title });
    await pickAndRead(user);

    // EXTRACTING: polite status + busy card; nothing else to act on.
    await waitFor(() =>
      expect(screen.getAllByRole("status").some((s) => s.textContent === copy.reading.title)).toBe(
        true,
      ),
    );
    expect(screen.getByText(copy.reading.description)).toBeInTheDocument();
    expect(screen.getByText(copy.reading.description).closest("[aria-busy='true']")).not.toBeNull();
    await expectAccessible();
    const readsBefore = mockCareerState().reads;
    await waitFor(() => expect(mockCareerState().reads).toBeGreaterThan(readsBefore + 1));

    finishMockExtraction();
    const title = await screen.findByRole("heading", { name: copy.review.title });
    await waitFor(() => expect(title).toHaveFocus());
    expect(screen.getByText(copy.review.description)).toBeInTheDocument();
    for (const section of Object.keys(copy.sections) as (keyof typeof copy.sections)[]) {
      expect(sectionRegion(section)).toBeInTheDocument();
    }
    expect(
      within(sectionRegion("contact")).getByText(MOCK_CV_CONTENT.contact.name!),
    ).toBeInTheDocument();
    await expectAccessible();

    // Polling stops once the draft is READY.
    const readsAtReady = mockCareerState().reads;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS * 5));
    expect(mockCareerState().reads).toBe(readsAtReady);
  });

  it("edits sections (validation, save, cancel) and confirms the CV base", async () => {
    resetMockCareer({ draft: mockDraft("READY") });
    const { user } = await renderCv();
    await screen.findByRole("heading", { name: copy.review.title });

    const contact = sectionRegion("contact");
    const edit = within(contact).getByRole("button", { name: copy.review.editSection });
    expect(edit).toHaveAttribute("aria-expanded", "false");
    expect(edit).toHaveAttribute("aria-controls");
    await user.click(edit);
    expect(edit).toHaveAttribute("aria-expanded", "true");
    const name = within(contact).getByLabelText(copy.fields.name);
    await waitFor(() => expect(name).toHaveFocus());
    await expectAccessible();
    await user.clear(name);
    await user.type(name, "Ana Revisada");
    await user.click(within(contact).getByRole("button", { name: copy.review.saveSection }));
    expect(within(contact).getByText(copy.review.sectionSaved)).toBeInTheDocument();
    expect(within(contact).getByText("Ana Revisada")).toBeInTheDocument();
    await waitFor(() => expect(edit).toHaveFocus());

    // A required field left empty blocks saving, with the error tied to the field.
    const languages = sectionRegion("languages");
    await user.click(within(languages).getByRole("button", { name: copy.review.editSection }));
    const language = within(languages).getAllByLabelText(new RegExp(`^${copy.fields.language}`), {
      selector: "input",
    })[0]!;
    await user.clear(language);
    await user.click(within(languages).getByRole("button", { name: copy.review.saveSection }));
    expect(language).toBeInvalid();
    expect(language).toHaveAccessibleDescription(copy.validation.required);

    // Confirming with an open section is refused and says which one.
    await user.click(screen.getByRole("button", { name: copy.review.confirm }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      copy.review.openSections(copy.sections.languages),
    );
    await user.type(language, "Espanhol");
    await user.click(within(languages).getByRole("button", { name: copy.review.saveSection }));

    // Cancel drops unsaved edits.
    const summary = sectionRegion("summary");
    await user.click(within(summary).getByRole("button", { name: copy.review.editSection }));
    await user.clear(within(summary).getByLabelText(copy.fields.summary));
    await user.click(within(summary).getByRole("button", { name: copy.review.cancelSection }));
    expect(within(summary).getByText(MOCK_CV_CONTENT.summary!.text)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: copy.review.confirm }));
    const badgeHeading = await screen.findByRole("heading", { name: copy.confirmed.badge });
    await waitFor(() => expect(badgeHeading).toHaveFocus());
    expect(screen.getByText(copy.confirmed.description)).toBeInTheDocument();
    expect(screen.getByText(/^Versão 1 · Confirmado em /)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: copy.confirmed.viewJobs })).toHaveAttribute(
      "href",
      "/carreira/vagas",
    );
    const confirmed = mockCareerState().active?.content;
    expect(confirmed?.contact.name).toBe("Ana Revisada");
    expect(confirmed?.languages[0]).toEqual({
      id: "lang-1",
      language: "Espanhol",
      level: "Nativo",
    });
    expect(mockCareerState().draft).toBeNull();
    await expectAccessible();
  });

  it("adds and removes items keeping stable ids", async () => {
    resetMockCareer({ draft: mockDraft("READY") });
    const { user } = await renderCv();
    await screen.findByRole("heading", { name: copy.review.title });

    const skills = sectionRegion("skills");
    await user.click(within(skills).getByRole("button", { name: copy.review.editSection }));
    await user.type(within(skills).getByLabelText(copy.fields.technical), "\nKotlin");
    await user.click(within(skills).getByRole("button", { name: copy.review.saveSection }));

    const certifications = sectionRegion("certifications");
    await user.click(within(certifications).getByRole("button", { name: copy.review.editSection }));
    await user.click(
      within(certifications).getByRole("button", { name: copy.items.add.certifications }),
    );
    const names = within(certifications).getAllByLabelText(
      new RegExp(`^${copy.fields.certification}`),
      {
        selector: "input",
      },
    );
    await waitFor(() => expect(names.at(-1)).toHaveFocus());
    await user.type(names.at(-1)!, "Certificação Nova");
    await user.click(within(certifications).getByRole("button", { name: copy.review.saveSection }));

    const other = sectionRegion("other");
    await user.click(within(other).getByRole("button", { name: copy.review.editSection }));
    await user.click(
      within(other).getByRole("button", { name: copy.items.remove(copy.items.other(1)) }),
    );
    await user.click(within(other).getByRole("button", { name: copy.review.saveSection }));

    await user.click(screen.getByRole("button", { name: copy.review.confirm }));
    await screen.findByRole("heading", { name: copy.confirmed.badge });
    const content = mockCareerState().active?.content;
    expect(content?.skills.technical.at(-1)).toEqual({ id: "skill-t-3", text: "Kotlin" });
    expect(content?.certifications.at(-1)).toEqual({
      id: "cert-2",
      name: "Certificação Nova",
      issuer: null,
      date: null,
    });
    expect(content?.other).toEqual([]);
  });

  it("FAILED extraction: Aurora's error with the safe reason; 'Tentar novamente' re-sends the same file", async () => {
    resetMockCareer({ nextOutcome: "failed", extractionMs: 0 });
    const { user } = await renderCv();
    await screen.findByRole("heading", { name: copy.empty.title });
    await pickAndRead(user);

    const title = await screen.findByRole("heading", { name: copy.error.title });
    const summary = title.closest("[role='alert']") as HTMLElement;
    expect(summary).toHaveTextContent(copy.error.description);
    expect(summary).toHaveTextContent(copy.error.reasons.EXTRACTION_FAILED);
    await waitFor(() => expect(summary).toHaveFocus());
    await expectAccessible();

    resetMockCareer({ draft: mockCareerState().draft, uploads: 1, extractionMs: 0 });
    await user.click(screen.getByRole("button", { name: copy.error.retry }));
    expect(await screen.findByRole("heading", { name: copy.review.title })).toBeInTheDocument();
    expect(mockCareerState().uploads).toBe(2);
  });

  it("422 CV_PDF_UNREADABLE and 413 map to the error card and to the file error", async () => {
    resetMockCareer({ nextOutcome: "unreadable" });
    const { user } = await renderCv();
    await screen.findByRole("heading", { name: copy.empty.title });
    await pickAndRead(user);
    const title = await screen.findByRole("heading", { name: copy.error.title });
    expect(title.closest("[role='alert']")).toHaveTextContent(copy.error.reasons.CV_PDF_UNREADABLE);
    expect(mockCareerState().draft).toBeNull();

    server.use(http.post("/api/v1/career/cv", () => problemResponse("PAYLOAD_TOO_LARGE")));
    await pickAndRead(user);
    await waitFor(() =>
      expect(screen.getByLabelText(copy.upload.label)).toHaveAccessibleDescription(
        expect.stringContaining(copy.upload.invalidFile),
      ),
    );
    await expectAccessible();
  });

  it("resumes a running extraction after leaving and coming back", async () => {
    resetMockCareer({
      draft: mockDraft("EXTRACTING"),
      pending: { outcome: "ok", readyAt: Infinity },
    });
    const first = await renderCv();
    expect(await screen.findByText(copy.reading.description)).toBeInTheDocument();
    first.unmount();

    finishMockExtraction();
    await renderCv();
    expect(await screen.findByRole("heading", { name: copy.review.title })).toBeInTheDocument();
  });

  it("pauses polling while the tab is hidden and refetches once when it is visible again", async () => {
    let visibility: DocumentVisibilityState = "visible";
    const descriptor = vi
      .spyOn(document, "visibilityState", "get")
      .mockImplementation(() => visibility);
    const setVisibility = (next: DocumentVisibilityState) => {
      visibility = next;
      window.dispatchEvent(new Event("visibilitychange"));
    };
    resetMockCareer({
      draft: mockDraft("EXTRACTING"),
      pending: { outcome: "ok", readyAt: Infinity },
    });
    // Slower than the other tests so "exactly one refetch" is not raced by the next interval tick.
    await renderApp(<CareerCvScreen pollInitialMs={300} />);
    await screen.findByText(copy.reading.description);

    setVisibility("hidden");
    const hiddenAt = mockCareerState().reads;
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(mockCareerState().reads).toBe(hiddenAt);

    // Coming back refetches at once, not on the next interval tick (≥ 300 ms away).
    setVisibility("visible");
    await waitFor(() => expect(mockCareerState().reads).toBe(hiddenAt + 1), { timeout: 60 });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(mockCareerState().reads).toBe(hiddenAt + 1);

    // Polling goes on afterwards: the extraction finishing still opens the review.
    finishMockExtraction();
    expect(await screen.findByRole("heading", { name: copy.review.title })).toBeInTheDocument();
    descriptor.mockRestore();
  });

  it("TIMED_OUT draft over an active CV keeps the confirmed CV visible", async () => {
    resetMockCareer({ active: mockActiveCv(2), draft: mockDraft("FAILED", "TIMED_OUT") });
    await renderCv();
    const title = await screen.findByRole("heading", { name: copy.error.title });
    expect(title.closest("[role='alert']")).toHaveTextContent(copy.error.reasons.TIMED_OUT);
    expect(screen.getByRole("heading", { name: copy.confirmed.badge })).toBeInTheDocument();
    expect(screen.getByText(/^Versão 2 · /)).toBeInTheDocument();
    await expectAccessible();
  });

  it("confirmed: replace opens a new upload that keeps the active CV until confirmed", async () => {
    resetMockCareer({ active: mockActiveCv(), extractionMs: 0 });
    const { user } = await renderCv();
    await screen.findByRole("heading", { name: copy.confirmed.badge });
    expect(screen.getByRole("link", { name: copy.confirmed.viewJobs })).toHaveAttribute(
      "href",
      "/carreira/vagas",
    );
    await user.click(screen.getByRole("button", { name: copy.confirmed.replace }));
    expect(screen.getByRole("heading", { name: copy.upload.replaceTitle })).toBeInTheDocument();
    expect(screen.getByText(copy.upload.replaceHint)).toBeInTheDocument();
    await expectAccessible();
    await user.click(screen.getByRole("button", { name: copy.upload.cancel }));
    expect(
      screen.queryByRole("heading", { name: copy.upload.replaceTitle }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: copy.confirmed.replace }));
    await pickAndRead(user);
    expect(await screen.findByRole("heading", { name: copy.review.title })).toBeInTheDocument();
    expect(mockCareerState().active?.version).toBe(1);
  });

  it("delete asks in a dialog, then the password (🔐), and empties the screen", async () => {
    resetMockCareer({ active: mockActiveCv() });
    const { user } = await renderCv();
    await screen.findByRole("heading", { name: copy.confirmed.badge });
    await user.click(screen.getByRole("button", { name: copy.confirmed.remove }));
    const dialog = await screen.findByRole("dialog", { name: copy.remove.title });
    expect(dialog).toHaveTextContent(copy.remove.description);
    await expectAccessible();
    await user.click(within(dialog).getByRole("button", { name: copy.remove.confirm }));

    const reauth = await screen.findByRole("dialog", { name: messages.auth.reauth.title });
    await user.type(within(reauth).getByLabelText(/^Senha/), MOCK_CREDENTIALS.password);
    await user.click(within(reauth).getByRole("button", { name: messages.auth.reauth.confirm }));

    expect(await screen.findByText(copy.remove.done)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: copy.empty.title })).toBeInTheDocument();
    expect(mockCareerState().active).toBeNull();
    await expectAccessible();
  });

  it("a failed DELETE says nothing was deleted and keeps the CV on screen", async () => {
    resetMockCareer({ active: mockActiveCv() });
    server.use(http.delete("/api/v1/career/cv", () => problemResponse("INTERNAL")));
    const { user } = await renderCv({ elevated: true });
    await screen.findByRole("heading", { name: copy.confirmed.badge });
    await user.click(screen.getByRole("button", { name: copy.confirmed.remove }));
    const dialog = await screen.findByRole("dialog", { name: copy.remove.title });
    await user.click(within(dialog).getByRole("button", { name: copy.remove.confirm }));

    const alert = await screen.findByText(copy.remove.error);
    expect(alert.closest("[role='alert']")).not.toBeNull();
    // The screen re-reads the state: the CV is still there and can be deleted again.
    expect(screen.getByRole("heading", { name: copy.confirmed.badge })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: copy.confirmed.remove })).toBeEnabled();
    expect(mockCareerState().active).not.toBeNull();
    await expectAccessible();
  });

  describe("closing the delete flow returns focus to 'Apagar CV'", () => {
    type User = ReturnType<typeof userEvent.setup>;
    const closers: [string, (user: User, dialog: HTMLElement) => Promise<void>][] = [
      ["Escape", (user) => user.keyboard("{Escape}")],
      [
        "Cancelar",
        (user, dialog) =>
          user.click(within(dialog).getAllByRole("button", { name: /^Cancelar$/ })[0]!),
      ],
    ];

    // `fireEvent.click` does not move focus, like WebKit (the Maestri portal, Safari) on a button click:
    // focus must come back to the trigger explicitly, not to whatever `document.activeElement` was.
    async function openDelete() {
      resetMockCareer({ active: mockActiveCv() });
      const { user } = await renderCv();
      await screen.findByRole("heading", { name: copy.confirmed.badge });
      fireEvent.click(screen.getByRole("button", { name: copy.confirmed.remove }));
      const dialog = await screen.findByRole("dialog", { name: copy.remove.title });
      return { user, dialog };
    }

    it.each(closers)("confirmation dialog, %s", async (_how, close) => {
      const { user, dialog } = await openDelete();
      await close(user, dialog);
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      await waitFor(() =>
        expect(screen.getByRole("button", { name: copy.confirmed.remove })).toHaveFocus(),
      );
      expect(mockCareerState().active).not.toBeNull();
    });

    it.each(closers)("password dialog, %s", async (_how, close) => {
      const { user, dialog } = await openDelete();
      fireEvent.click(within(dialog).getByRole("button", { name: copy.remove.confirm }));
      const reauth = await screen.findByRole("dialog", { name: messages.auth.reauth.title });
      await close(user, reauth);
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      // The status is announced, but focus goes back to the trigger, not to the status.
      expect(await screen.findByText(copy.remove.cancelled)).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.getByRole("button", { name: copy.confirmed.remove })).toHaveFocus(),
      );
      expect(mockCareerState().active).not.toBeNull();
    });
  });

  it("a draft replaced in another tab cannot be confirmed (409 CV_DRAFT_NOT_READY)", async () => {
    resetMockCareer({ draft: mockDraft("READY") });
    const { user } = await renderCv();
    await screen.findByRole("heading", { name: copy.review.title });
    resetMockCareer({ draft: mockDraft("READY") });
    await user.click(screen.getByRole("button", { name: copy.review.confirm }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      copy.review.errors.CV_DRAFT_NOT_READY,
    );
    expect(mockCareerState().active).toBeNull();
  });

  it("never writes CV content to the console (canary)", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
      vi.spyOn(console, method),
    );
    resetMockCareer({ extractionMs: 0 });
    const { user } = await renderCv();
    await screen.findByRole("heading", { name: copy.empty.title });
    await pickAndRead(user);
    await screen.findByRole("heading", { name: copy.review.title });
    await user.click(screen.getByRole("button", { name: copy.review.confirm }));
    await screen.findByRole("heading", { name: copy.confirmed.badge });
    const output = spies
      .flatMap((spy) => spy.mock.calls.flat())
      .map(String)
      .join("\n");
    for (const canary of [MOCK_CV_CONTENT.contact.name!, MOCK_CV_CONTENT.contact.email!]) {
      expect(output).not.toContain(canary);
    }
  });
});
