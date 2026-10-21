import { describe, expect, it } from "vitest";
import { escapeLittleText } from "./little-text.js";

describe("escapeLittleText", () => {
  it("escapes every reserved character, including the backslash itself", () => {
    expect(escapeLittleText("a\\b|c{d}e@f[g]h(i)j<k>l#m*n_o~p")).toBe(
      "a\\\\b\\|c\\{d\\}e\\@f\\[g\\]h\\(i\\)j\\<k\\>l\\#m\\*n\\_o\\~p",
    );
  });

  it("keeps plain text, accents, emoji and line breaks untouched", () => {
    const text = "Olá, mundo! Ação 100% real.\n\nSegunda linha 🚀";
    expect(escapeLittleText(text)).toBe(text);
  });
});
