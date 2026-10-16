import axe, { type AxeResults, type RunOptions } from "axe-core";

/** axe-core in jsdom: colour contrast needs real layout, so it is checked against the token table instead. */
export async function runAxe(container: Element, options: RunOptions = {}): Promise<AxeResults> {
  return axe.run(container, {
    rules: { "color-contrast": { enabled: false } },
    ...options,
  });
}

export function formatViolations(results: AxeResults): string {
  return results.violations
    .map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.html).join("\n  ")}`)
    .join("\n");
}
