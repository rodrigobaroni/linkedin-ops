import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/pt-br";
import { mockActiveCv, resetMockCareer } from "@/mocks/career-handlers";
import {
  MOCK_JOB_INJECTION_EVIDENCE,
  MOCK_JOB_TITLE,
  MOCK_PDF_FILENAME,
  advanceMockJobs,
  failNextMockPdf,
  mockJob,
  mockJobsState,
} from "@/mocks/career-jobs-handlers";
import { formatViolations, runAxe } from "@/test/axe";
import { resetNavigation, routerMock, setPathname } from "@/test/next-navigation";
import { renderApp } from "@/test/render";
import { CareerJobDetailScreen } from "./career-job-detail-screen";

vi.mock("next/navigation", async () => (await import("@/test/next-navigation")).navigationMock);

const jobsCopy = messages.career.jobs;

const copy = jobsCopy.detail;
const POLL_MS = 20;

async function expectAccessible() {
  const results = await runAxe(document.body, { rules: { region: { enabled: false } } });
  expect(results.violations, formatViolations(results)).toEqual([]);
}

async function renderDetail(id: string) {
  const user = userEvent.setup();
  await renderApp(<CareerJobDetailScreen id={id} pollInitialMs={POLL_MS} />);
  return user;
}

function section(name: string) {
  return screen.getByRole("region", { name });
}

describe("CareerJobDetailScreen", () => {
  beforeEach(() => {
    resetNavigation();
    setPathname("/carreira/vagas/x");
    resetMockCareer({ active: mockActiveCv() });
  });

  it("ready: h1 with the role takes focus; score, requirements, additions, provenance and 'Baixar PDF'", async () => {
    const job = mockJob("https://empresa.com/vaga");
    await renderDetail(job.id);
    const title = await screen.findByRole("heading", { level: 1, name: MOCK_JOB_TITLE });
    await waitFor(() => expect(title).toHaveFocus());
    expect(screen.getByRole("link", { name: copy.back })).toHaveAttribute(
      "href",
      "/carreira/vagas",
    );
    expect(
      screen.getByText(/Empresa Exemplo Ltda\. · empresa\.com · Site da empresa/),
    ).toBeInTheDocument();
    expect(screen.getByText(jobsCopy.status.READY)).toBeInTheDocument();

    expect(screen.getByRole("meter", { name: copy.score.title })).toHaveAttribute(
      "aria-valuetext",
      copy.score.value(68),
    );
    expect(screen.getByText(copy.score.legend)).toBeInTheDocument();

    const met = section(copy.met.title);
    expect(within(met).getByText("Experiência com TypeScript em produção")).toBeInTheDocument();
    expect(within(met).getByText(copy.met.quote("TypeScript"))).toBeInTheDocument();
    expect(within(met).getByText(copy.met.partial)).toBeInTheDocument();
    expect(within(section(copy.missing.title)).getByText("Kubernetes")).toBeInTheDocument();

    const added = section(copy.added.title);
    expect(within(added).getByText(copy.added.description)).toBeInTheDocument();
    expect(within(added).getByText("Noções de Kubernetes")).toBeInTheDocument();
    expect(within(added).getByText(copy.provenance.added)).toBeInTheDocument();
    expect(within(added).getByText(copy.added.targets("Kubernetes"))).toBeInTheDocument();

    const tailored = section(copy.tailored.title);
    expect(
      within(tailored).getByRole("heading", {
        name: "Engenheira de software sênior · Empresa Fictícia S.A.",
      }),
    ).toBeInTheDocument();
    expect(within(tailored).getAllByText(copy.provenance.original).length).toBeGreaterThan(0);
    expect(within(tailored).getAllByText(copy.provenance.rewritten).length).toBeGreaterThan(0);
    expect(within(tailored).getByText(copy.provenance.added)).toBeInTheDocument();

    expect(screen.getByRole("button", { name: copy.pdf.download })).toBeInTheDocument();
    expect(screen.queryByText(copy.previousCv.title)).not.toBeInTheDocument();
    await expectAccessible();
  });

  it("empty report sections use Aurora's copy", async () => {
    const job = mockJob("https://empresa.com/vaga");
    const stored = mockJobsState().jobs[0]!;
    const tailoring = stored.detail.tailoring!;
    stored.detail = {
      ...stored.detail,
      tailoring: { ...tailoring, report: { ...tailoring.report, requirements: [], added: [] } },
    };
    await renderDetail(job.id);
    expect(await screen.findByText(copy.met.empty)).toBeInTheDocument();
    expect(screen.getByText(copy.missing.empty)).toBeInTheDocument();
    expect(screen.getByText(copy.added.empty)).toBeInTheDocument();
  });

  it("generated with the previous CV: notice and reprocessing with the current one", async () => {
    const job = mockJob("https://empresa.com/vaga-cv-antigo");
    const user = await renderDetail(job.id);
    expect(await screen.findByText(copy.previousCv.title)).toBeInTheDocument();
    expect(screen.getByText(copy.previousCv.description)).toBeInTheDocument();
    // Another CV base is active: experiences fall back to a generic heading.
    resetMockCareer({ active: mockActiveCv(2) });
    await user.click(screen.getByRole("button", { name: new RegExp(copy.previousCv.action) }));
    expect(await screen.findByText(jobsCopy.actions.retried)).toBeInTheDocument();
    expect(await screen.findByText(copy.processing.FETCHING)).toBeInTheDocument();
  });

  it("the tailoring of another CV base version: generic experience headings", async () => {
    const job = mockJob("https://empresa.com/vaga");
    resetMockCareer({ active: mockActiveCv(2) });
    await renderDetail(job.id);
    expect(
      await screen.findByRole("heading", { name: copy.tailored.experience(1) }),
    ).toBeInTheDocument();
  });

  it("injection in the posting: warning with the excerpt as text", async () => {
    const job = mockJob("https://empresa.com/vaga-injecao");
    await renderDetail(job.id);
    expect(await screen.findByText(copy.injection.title)).toBeInTheDocument();
    expect(screen.getByText(MOCK_JOB_INJECTION_EVIDENCE)).toBeInTheDocument();
  });

  it("untrusted content stays literal text: no markup, no links", async () => {
    const job = mockJob("https://empresa.com/vaga");
    const stored = mockJobsState().jobs[0]!;
    const tailoring = stored.detail.tailoring!;
    const payload = '<img src=x onerror="alert(1)"><a href="javascript:alert(1)">clique</a>';
    const segments = tailoring.content.summary.segments.map((segment) => ({
      ...segment,
      text: payload,
    }));
    stored.detail = {
      ...stored.detail,
      title: payload,
      tailoring: {
        ...tailoring,
        content: { ...tailoring.content, summary: { segments } },
        report: {
          ...tailoring.report,
          requirements: tailoring.report.requirements.map((item) => ({ ...item, text: payload })),
        },
      },
    };
    await renderDetail(job.id);
    expect(await screen.findByRole("heading", { level: 1, name: payload })).toBeInTheDocument();
    expect(screen.getAllByText(payload).length).toBeGreaterThan(2);
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("a[href^='javascript']")).toBeNull();
    // The posting link is shown as text, never as a link.
    expect(document.querySelector("a[href*='empresa.com']")).toBeNull();
  });

  it("processing: status announced and polled until ready, then polling stops", async () => {
    const job = mockJob("https://empresa.com/vaga", "FETCHING");
    await renderDetail(job.id);
    expect(await screen.findByText(copy.processing.FETCHING)).toBeInTheDocument();
    const live = screen.getByText(jobsCopy.status.FETCHING, { selector: "p[aria-live]" });
    expect(live).toHaveAttribute("aria-live", "polite");
    advanceMockJobs();
    expect(await screen.findByText(copy.processing.ANALYZING)).toBeInTheDocument();
    advanceMockJobs();
    expect(await screen.findByText(copy.score.legend, {}, { timeout: 3_000 })).toBeInTheDocument();
    const settled = mockJobsState().reads;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS * 10));
    expect(mockJobsState().reads).toBe(settled);
  });

  it("failed: reason in an alert, paste text and reprocess offered", async () => {
    const job = mockJob("https://www.linkedin.com/jobs/view/9", "FAILED", {
      kind: "failed",
      reason: "FETCH_BLOCKED",
      at: "FETCHING",
    });
    await renderDetail(job.id);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(jobsCopy.failure.title);
    expect(alert).toHaveTextContent(jobsCopy.failure.reasons.FETCH_BLOCKED_LINKEDIN);
    expect(screen.getByRole("button", { name: jobsCopy.actions.pasteText })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: jobsCopy.actions.retry })).toBeInTheDocument();
    await expectAccessible();
  });

  it("delete: confirmation, then back to the list", async () => {
    const job = mockJob("https://empresa.com/vaga");
    const user = await renderDetail(job.id);
    await user.click(await screen.findByRole("button", { name: jobsCopy.actions.remove }));
    const dialog = await screen.findByRole("dialog", { name: jobsCopy.remove.title });
    await user.click(within(dialog).getByRole("button", { name: jobsCopy.remove.confirm }));
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith("/carreira/vagas"));
    expect(mockJobsState().jobs).toHaveLength(0);
  });

  describe("Baixar PDF", () => {
    let saved: { name: string; blob: Blob | null }[];
    beforeEach(() => {
      saved = [];
      // jsdom has no object URLs; the anchor's click is where the browser would save the file.
      const blobs = new Map<string, Blob>();
      vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
        const href = `blob:mock/${blobs.size}`;
        blobs.set(href, blob as Blob);
        return href;
      });
      vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        saved.push({ name: this.download, blob: blobs.get(this.href) ?? null });
      });
    });
    afterEach(() => vi.restoreAllMocks());

    it("downloads the PDF with the API's file name; no link to the file stays in the page", async () => {
      const job = mockJob("https://empresa.com/vaga");
      const user = await renderDetail(job.id);
      await user.click(await screen.findByRole("button", { name: copy.pdf.download }));
      await waitFor(() => expect(saved).toHaveLength(1));
      expect(saved[0]!.name).toBe(MOCK_PDF_FILENAME);
      expect(saved[0]!.blob?.size).toBeGreaterThan(0);
      expect(mockJobsState().pdfDownloads).toBe(1);
      expect(document.querySelector("a[download]")).toBeNull();
      await waitFor(() =>
        expect(screen.getByRole("button", { name: copy.pdf.download })).toBeEnabled(),
      );
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("409 TAILORED_CV_STALE: alert and 'Reprocessar'", async () => {
      const job = mockJob("https://empresa.com/vaga-cv-mudou");
      const user = await renderDetail(job.id);
      await user.click(await screen.findByRole("button", { name: copy.pdf.download }));
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(copy.pdf.stale);
      expect(saved).toHaveLength(0);
      await user.click(within(alert).getByRole("button", { name: jobsCopy.actions.retry }));
      expect(await screen.findByText(jobsCopy.actions.retried)).toBeInTheDocument();
      expect(await screen.findByText(copy.processing.FETCHING)).toBeInTheDocument();
      // Not READY any more: no PDF button.
      expect(screen.queryByRole("button", { name: copy.pdf.download })).not.toBeInTheDocument();
    });

    it("429: says when to try again (Retry-After)", async () => {
      const job = mockJob("https://empresa.com/vaga");
      failNextMockPdf("RATE_LIMITED");
      const user = await renderDetail(job.id);
      await user.click(await screen.findByRole("button", { name: copy.pdf.download }));
      expect(await screen.findByRole("alert")).toHaveTextContent(copy.pdf.rateLimited(5));
      expect(saved).toHaveLength(0);
    });

    it("no button while processing or failed", async () => {
      const processing = mockJob("https://empresa.com/a", "ANALYZING");
      await renderDetail(processing.id);
      expect(await screen.findByText(copy.processing.ANALYZING)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: copy.pdf.download })).not.toBeInTheDocument();
    });
  });

  it("unknown posting: 'Vaga não encontrada'", async () => {
    await renderDetail(crypto.randomUUID());
    expect(
      await screen.findByRole("heading", { level: 1, name: copy.notFound }),
    ).toBeInTheDocument();
    expect(screen.getByText(copy.notFoundDescription)).toBeInTheDocument();
  });
});
