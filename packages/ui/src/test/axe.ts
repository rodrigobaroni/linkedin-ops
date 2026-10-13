import axe, { type AxeResults, type RunOptions } from "axe-core";

/**
 * Run axe-core against a rendered container (jsdom). Colour-contrast rules depend on real layout and
 * are skipped here; contrast is verified against the token table and in the browser by Aurora/Crivo.
 */
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
