import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/pt-br";
import { mockActiveCv, mockDraft, resetMockCareer } from "@/mocks/career-handlers";
import { formatViolations, runAxe } from "@/test/axe";
import { resetNavigation, setPathname } from "@/test/next-navigation";
import { renderApp } from "@/test/render";
import { CareerJobsScreen } from "./career-jobs-screen";

vi.mock("next/navigation", async () => (await import("@/test/next-navigation")).navigationMock);

const copy = messages.career.jobs;

async function expectAccessible() {
  const results = await runAxe(document.body, { rules: { region: { enabled: false } } });
  expect(results.violations, formatViolations(results)).toEqual([]);
}

describe("CareerJobsScreen", () => {
  beforeEach(() => {
    resetNavigation();
    setPathname("/carreira/vagas");
  });

  it("without a CV base: Aurora's copy and 'Ir para Meu CV', accessible", async () => {
    resetMockCareer();
    await renderApp(<CareerJobsScreen />);
    expect(await screen.findByRole("heading", { name: copy.noCv.title })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: copy.title })).toBeInTheDocument();
    expect(screen.getByText(copy.description)).toBeInTheDocument();
    expect(screen.getByText(copy.noCv.description)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: messages.nav.home })).toHaveAttribute("href", "/hoje");
    expect(screen.getByText(messages.career.breadcrumb)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: copy.noCv.action })).toHaveAttribute(
      "href",
      "/carreira/cv",
    );
    await expectAccessible();
  });

  it("a draft not yet confirmed still counts as no CV base", async () => {
    resetMockCareer({ draft: mockDraft("READY") });
    await renderApp(<CareerJobsScreen />);
    expect(await screen.findByRole("heading", { name: copy.noCv.title })).toBeInTheDocument();
  });

  it("with a confirmed CV base: the interim 'em breve' state, no link to Meu CV", async () => {
    resetMockCareer({ active: mockActiveCv() });
    await renderApp(<CareerJobsScreen />);
    expect(await screen.findByRole("heading", { name: copy.comingSoon.title })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: copy.noCv.title })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: copy.noCv.action })).not.toBeInTheDocument();
    await expectAccessible();
  });
});
