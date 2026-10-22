import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/pt-br";
import { mockActiveCv, mockDraft, resetMockCareer } from "@/mocks/career-handlers";
import { mockJob, mockJobsState, resetMockJobs } from "@/mocks/career-jobs-handlers";
import { formatViolations, runAxe } from "@/test/axe";
import { resetNavigation, setPathname } from "@/test/next-navigation";
import { renderApp } from "@/test/render";
import { CareerJobsScreen } from "./career-jobs-screen";

vi.mock("next/navigation", async () => (await import("@/test/next-navigation")).navigationMock);

const copy = messages.career.jobs;
const POLL_MS = 20;
const JOB_TITLE = "Pessoa engenheira de software sênior";

async function expectAccessible() {
  const results = await runAxe(document.body, { rules: { region: { enabled: false } } });
  expect(results.violations, formatViolations(results)).toEqual([]);
}

async function renderJobs() {
  const user = userEvent.setup();
  await renderApp(<CareerJobsScreen pollInitialMs={POLL_MS} />);
  return user;
}

function field() {
  return screen.getByRole("textbox", { name: copy.form.label });
}

async function submitLinks(user: ReturnType<typeof userEvent.setup>, links: string[]) {
  await user.click(await screen.findByRole("textbox", { name: copy.form.label }));
  await user.paste(links.join("\n"));
  await user.click(screen.getByRole("button", { name: copy.form.submit }));
}

describe("CareerJobsScreen", () => {
  beforeEach(() => {
    resetNavigation();
    setPathname("/carreira/vagas");
  });

  describe("without a confirmed CV base", () => {
    it("Aurora's copy and 'Ir para Meu CV', accessible", async () => {
      resetMockCareer();
      await renderApp(<CareerJobsScreen />);
      expect(await screen.findByRole("heading", { name: copy.noCv.title })).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 1, name: copy.title })).toBeInTheDocument();
      expect(screen.getByText(copy.description)).toBeInTheDocument();
      expect(screen.getByText(copy.noCv.description)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: messages.nav.home })).toHaveAttribute(
        "href",
        "/hoje",
      );
      expect(screen.getByRole("link", { name: copy.noCv.action })).toHaveAttribute(
        "href",
        "/carreira/cv",
      );
      expect(screen.queryByRole("textbox", { name: copy.form.label })).not.toBeInTheDocument();
      await expectAccessible();
    });

    it("a draft not yet confirmed still counts as no CV base", async () => {
      resetMockCareer({ draft: mockDraft("READY") });
      await renderApp(<CareerJobsScreen />);
      expect(await screen.findByRole("heading", { name: copy.noCv.title })).toBeInTheDocument();
    });
  });

  describe("with a confirmed CV base", () => {
    beforeEach(() => resetMockCareer({ active: mockActiveCv() }));

    it("form, counter and empty list instead of the former interim state; accessible", async () => {
      const user = await renderJobs();
      expect(await screen.findByRole("textbox", { name: copy.form.label })).toBeInTheDocument();
      expect(await screen.findByText(copy.list.empty)).toBeInTheDocument();
      expect(field()).toHaveAccessibleDescription(`${copy.form.hint} ${copy.form.counter(0)}`);
      expect(field()).toHaveAttribute("placeholder", copy.form.placeholder);
      await user.type(
        field(),
        "https://empresa.com/vagas/1{enter}{enter}https://empresa.com/vagas/2",
      );
      expect(screen.getByText(copy.form.counter(2))).toBeInTheDocument();
      expect(screen.queryByText(copy.noCv.title)).not.toBeInTheDocument();
      await expectAccessible();
    });

    it("validation: empty, more than 20 and invalid links by position; nothing is sent", async () => {
      const user = await renderJobs();
      const submit = await screen.findByRole("button", { name: copy.form.submit });
      await user.click(submit);
      expect(await screen.findByText(copy.form.empty)).toBeInTheDocument();
      expect(field()).toHaveAttribute("aria-invalid", "true");
      expect(field()).toHaveFocus();

      const many = Array.from({ length: 21 }, (_, index) => `https://empresa.com/vagas/${index}`);
      await user.paste(many.join("\n"));
      await user.click(submit);
      expect(await screen.findByText(copy.form.tooMany)).toBeInTheDocument();

      await user.clear(field());
      await user.paste(
        "https://empresa.com/vagas/1\nempresa.com/sem-esquema\nhttp://10.0.0.1/vaga",
      );
      await user.click(submit);
      expect(await screen.findByText(copy.form.invalid)).toBeInTheDocument();
      expect(screen.getByText(copy.form.invalidLine(2))).toBeInTheDocument();
      expect(screen.getByText(copy.form.invalidLine(3))).toBeInTheDocument();
      expect(screen.queryByText(copy.form.invalidLine(1))).not.toBeInTheDocument();
      expect(mockJobsState().batches).toEqual([]);
    });

    it("sends the batch; per-link feedback (queued, blocked, merged); the list polls until settled", async () => {
      resetMockJobs({ stepMs: 0 });
      const user = await renderJobs();
      await submitLinks(user, [
        "https://empresa.com/vagas/1?utm_source=x",
        "https://empresa.com/vagas/1",
        "https://www.linkedin.com/in/alguem",
        "https://outra.com.br/vaga/site-fora",
      ]);

      const feedback = (await screen.findByText(copy.form.success)).closest<HTMLElement>(
        "[role=status]",
      )!;
      expect(within(feedback).getByText(copy.form.result.duplicates(1))).toBeInTheDocument();
      expect(
        within(feedback).getByText(copy.form.result.blocked, { exact: false }),
      ).toBeInTheDocument();
      expect(within(feedback).getAllByText(copy.form.result.queued, { exact: false })).toHaveLength(
        2,
      );
      expect(field()).toHaveValue("");
      expect(mockJobsState().batches).toHaveLength(1);

      // The blocked LinkedIn link: failed at once, with the LinkedIn reason and "Colar texto da vaga".
      const blocked = await screen.findByRole("article", { name: "linkedin.com" });
      expect(
        within(blocked).getByText(copy.failure.reasons.FETCH_BLOCKED_LINKEDIN),
      ).toBeInTheDocument();
      expect(
        within(blocked).getByRole("button", { name: /Colar texto da vaga/ }),
      ).toBeInTheDocument();

      // Polling moves the others along until nothing is processing, then stops.
      const ready = await screen.findByRole("article", { name: JOB_TITLE }, { timeout: 3_000 });
      await waitFor(() => expect(within(ready).getByText(copy.status.READY)).toBeInTheDocument(), {
        timeout: 3_000,
      });
      await waitFor(
        () => expect(screen.getByText(copy.failure.reasons.FETCH)).toBeInTheDocument(),
        {
          timeout: 3_000,
        },
      );
      expect(within(ready).getByRole("link", { name: /Ver relatório/ })).toHaveAttribute(
        "href",
        expect.stringMatching(/^\/carreira\/vagas\/[0-9a-f-]+$/),
      );
      await waitFor(() =>
        expect(screen.getByText(/vaga pronta|vaga falhou/)).toHaveAttribute("aria-live", "polite"),
      );
      const readsSettled = mockJobsState().reads;
      await new Promise((resolve) => setTimeout(resolve, POLL_MS * 10));
      expect(mockJobsState().reads).toBe(readsSettled);
      await expectAccessible();
    });

    it("412: the CV base is gone, the screen goes back to 'Confirme seu CV'", async () => {
      const user = await renderJobs();
      await screen.findByRole("textbox", { name: copy.form.label });
      resetMockCareer();
      await submitLinks(user, ["https://empresa.com/vagas/1"]);
      expect(await screen.findByRole("heading", { name: copy.noCv.title })).toBeInTheDocument();
    });

    it("422 shows the API's position-only detail; 503 keeps the links in the field", async () => {
      const user = await renderJobs();
      await submitLinks(user, ["https://empresa.com/vagas/1", "https://empresa.com/vaga-longo"]);
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(copy.form.errors.rejected);
      expect(alert).toHaveTextContent("posição 2");
      expect(alert).not.toHaveTextContent("empresa.com");
      await waitFor(() => expect(alert.parentElement).toHaveFocus());

      resetMockJobs({ nextBatchProblem: "UPSTREAM_UNAVAILABLE" });
      await user.clear(field());
      await submitLinks(user, ["https://empresa.com/vagas/1"]);
      expect(await screen.findByText(copy.form.errors.unavailable)).toBeInTheDocument();
      expect(field()).toHaveValue("https://empresa.com/vagas/1");
    });

    it("VALIDATION_FAILED on urls[i] marks that position", async () => {
      resetMockJobs({ nextBatchProblem: "VALIDATION_FAILED" });
      const user = await renderJobs();
      await submitLinks(user, ["https://empresa.com/vagas/1"]);
      expect(await screen.findByText(copy.form.invalidLine(1))).toBeInTheDocument();
      expect(field()).toHaveAttribute("aria-invalid", "true");
    });

    it("failure reasons are readable and distinct per reason and source", async () => {
      const fail = (reason: "NOT_A_JOB" | "FETCH_BLOCKED" | "AI" | "TIMED_OUT") =>
        ({ kind: "failed", reason, at: "FETCHING" }) as const;
      mockJob("https://empresa.com/a", "FAILED", fail("NOT_A_JOB"));
      mockJob("https://empresa.com/b", "FAILED", fail("FETCH_BLOCKED"));
      mockJob("https://www.linkedin.com/jobs/view/1", "FAILED", fail("FETCH_BLOCKED"));
      mockJob("https://empresa.com/c", "FAILED", fail("AI"));
      mockJob("https://empresa.com/d", "FAILED", fail("TIMED_OUT"));
      await renderJobs();
      const reasons = copy.failure.reasons;
      for (const text of [
        reasons.NOT_A_JOB,
        reasons.FETCH_BLOCKED_OTHER,
        reasons.FETCH_BLOCKED_LINKEDIN,
        reasons.AI,
        reasons.TIMED_OUT,
      ]) {
        expect(await screen.findByText(text)).toBeInTheDocument();
      }
      expect(screen.getAllByText(copy.failure.title)).toHaveLength(5);
      await expectAccessible();
    });

    it("paste text: validated, sent, dialog closes and focus goes to the outcome", async () => {
      const failed = mockJob("https://empresa.com/vaga", "FAILED");
      const user = await renderJobs();
      const row = await screen.findByRole("article", { name: "empresa.com" });
      const trigger = within(row).getByRole("button", { name: /Colar texto da vaga/ });
      await user.click(trigger);
      const dialog = await screen.findByRole("dialog", { name: copy.paste.title });
      expect(within(dialog).getByText(copy.paste.description)).toBeInTheDocument();
      const textarea = within(dialog).getByRole("textbox", { name: copy.paste.label });
      expect(textarea).toHaveAttribute("placeholder", copy.paste.placeholder);
      await user.type(textarea, "curto");
      await user.click(within(dialog).getByRole("button", { name: copy.paste.submit }));
      expect(await within(dialog).findByText(copy.paste.tooShort)).toBeInTheDocument();

      await user.click(textarea);
      await user.paste(" Requisitos: TypeScript.".repeat(12));
      await user.click(within(dialog).getByRole("button", { name: copy.paste.submit }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      // The trigger is gone (the posting is processing again): focus goes to the outcome.
      const done = await screen.findByText(copy.paste.done);
      await waitFor(() => expect(done.closest("[tabindex='-1']")).toHaveFocus());
      const stored = mockJobsState().jobs.find((job) => job.detail.id === failed.id);
      expect(stored?.detail.source).toBe("PASTED");
      expect(stored?.detail.status).toBe("FETCHING");
    });

    it("paste text: a NUL character is refused before sending, with its own message", async () => {
      const failed = mockJob("https://empresa.com/vaga", "FAILED");
      const user = await renderJobs();
      const row = await screen.findByRole("article", { name: "empresa.com" });
      await user.click(within(row).getByRole("button", { name: /Colar texto da vaga/ }));
      const dialog = await screen.findByRole("dialog", { name: copy.paste.title });
      await user.click(within(dialog).getByRole("textbox", { name: copy.paste.label }));
      await user.paste(`${" Requisitos: TypeScript.".repeat(12)}\u0000`);
      await user.click(within(dialog).getByRole("button", { name: copy.paste.submit }));
      expect(await within(dialog).findByText(copy.paste.invalidChars)).toBeInTheDocument();
      const stored = mockJobsState().jobs.find((job) => job.detail.id === failed.id);
      expect(stored?.detail.status).toBe("FAILED");
    });

    it("paste text: Escape closes the dialog and focus returns to the trigger", async () => {
      mockJob("https://empresa.com/vaga", "FAILED");
      const user = await renderJobs();
      const row = await screen.findByRole("article", { name: "empresa.com" });
      const trigger = within(row).getByRole("button", { name: /Colar texto da vaga/ });
      await user.click(trigger);
      await screen.findByRole("dialog", { name: copy.paste.title });
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      await waitFor(() => expect(trigger).toHaveFocus());
    });

    it("menu: reprocess a ready posting; delete with confirmation", async () => {
      mockJob("https://empresa.com/vaga");
      const user = await renderJobs();
      const row = await screen.findByRole("article", { name: JOB_TITLE });
      expect(within(row).getByText(copy.list.score(68))).toBeInTheDocument();
      const menu = within(row).getByRole("button", { name: copy.actions.more(JOB_TITLE) });
      await user.click(menu);
      await user.click(await screen.findByRole("button", { name: copy.actions.retry }));
      expect(await screen.findByText(copy.actions.retried)).toBeInTheDocument();
      expect(await within(row).findByText(copy.status.FETCHING)).toBeInTheDocument();

      // Still processing: the menu only offers deleting.
      await user.click(menu);
      await screen.findByRole("button", { name: copy.actions.remove });
      expect(screen.queryByRole("button", { name: copy.actions.retry })).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: copy.actions.remove }));
      const dialog = await screen.findByRole("dialog", { name: copy.remove.title });
      expect(within(dialog).getByText(copy.remove.description)).toBeInTheDocument();
      await user.click(within(dialog).getByRole("button", { name: copy.remove.cancel }));
      await waitFor(() => expect(menu).toHaveFocus());
      expect(mockJobsState().jobs).toHaveLength(1);

      await user.click(menu);
      await user.click(await screen.findByRole("button", { name: copy.actions.remove }));
      await user.click(
        within(await screen.findByRole("dialog")).getByRole("button", {
          name: copy.remove.confirm,
        }),
      );
      const removed = await screen.findByText(copy.actions.removed);
      expect(await screen.findByText(copy.list.empty)).toBeInTheDocument();
      await waitFor(() => expect(removed.closest("[tabindex='-1']")).toHaveFocus());
      expect(mockJobsState().jobs).toHaveLength(0);
    });

    it("reprocessing a LinkedIn link that is not a job view asks for the text", async () => {
      const user = await renderJobs();
      await submitLinks(user, ["https://www.linkedin.com/in/alguem"]);
      const row = await screen.findByRole("article", { name: "linkedin.com" });
      await user.click(
        within(row).getByRole("button", { name: copy.actions.more("linkedin.com") }),
      );
      await user.click(await screen.findByRole("button", { name: copy.actions.retry }));
      expect(await screen.findByText(copy.actions.errors.needsText)).toBeInTheDocument();
    });

    it("posting data is plain text: markup in a title stays literal", async () => {
      mockJob("https://empresa.com/vaga");
      const job = mockJobsState().jobs[0]!;
      job.detail = { ...job.detail, title: '<img src=x onerror="alert(1)">' };
      await renderJobs();
      expect(
        await screen.findByRole("heading", { name: '<img src=x onerror="alert(1)">' }),
      ).toBeInTheDocument();
      expect(document.querySelector("img")).toBeNull();
    });
  });
});
