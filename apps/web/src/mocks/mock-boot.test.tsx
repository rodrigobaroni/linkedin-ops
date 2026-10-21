import { act, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";
import { MockBoot } from "./mock-boot";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("MockBoot", () => {
  it("renders children immediately when the mock is disabled", () => {
    render(<MockBoot start={null}>conteúdo</MockBoot>);
    expect(screen.getByText("conteúdo")).toBeInTheDocument();
  });

  it("mounts nothing (so no GET /auth/me) until the worker has started, even in Strict Mode", async () => {
    const worker = deferred();
    const start = vi.fn(() => worker.promise);
    const child = vi.fn(() => <span>app</span>);
    const Child = child;
    render(
      <StrictMode>
        <MockBoot start={start}>
          <Child />
        </MockBoot>
      </StrictMode>,
    );
    expect(child).not.toHaveBeenCalled();
    expect(screen.queryByText("app")).not.toBeInTheDocument();
    await act(async () => worker.resolve());
    expect(await screen.findByText("app")).toBeInTheDocument();
  });

  it("does not fall through to the real network when the worker fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const worker = deferred();
    render(
      <MockBoot start={() => worker.promise}>
        <span>app</span>
      </MockBoot>,
    );
    await act(async () => worker.reject(new Error("boom")));
    expect(await screen.findByRole("alert")).toHaveTextContent("Mock da API");
    expect(screen.queryByText("app")).not.toBeInTheDocument();
  });
});
