import { describe, expect, it } from "vitest";
import { loginHref, safeNextPath } from "./next-path";

describe("safeNextPath", () => {
  it("keeps same-origin relative destinations with their query", () => {
    expect(safeNextPath("/curadoria")).toBe("/curadoria");
    expect(safeNextPath("/estudio/abc?aba=preview")).toBe("/estudio/abc?aba=preview");
  });

  it.each([
    [null],
    [undefined],
    [""],
    ["curadoria"],
    ["//evil.example"],
    ["/\\evil.example"],
    ["https://evil.example/hoje"],
    ["javascript:alert(1)"],
    ["/login"],
    ["/login?next=%2Fhoje"],
  ])("falls back to /hoje for %j", (raw) => {
    expect(safeNextPath(raw)).toBe("/hoje");
  });
});

describe("loginHref", () => {
  it("omits next for the home and unsafe values, encodes it otherwise", () => {
    expect(loginHref("/hoje")).toBe("/login");
    expect(loginHref("//evil.example")).toBe("/login");
    expect(loginHref("/curadoria?x=1")).toBe("/login?next=%2Fcuradoria%3Fx%3D1");
  });
});
