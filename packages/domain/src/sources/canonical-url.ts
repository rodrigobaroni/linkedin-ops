/**
 * Canonical form of a source/item URL (data-model.md §2.3): lowercase scheme and host, default port
 * dropped, fragment dropped, tracking parameters removed, remaining parameters kept in a stable order.
 * Non-tracking query parameters are preserved because they can identify different feeds/pages.
 */
const TRACKING_PARAMETER_PREFIXES = ["utm_", "mtm_", "pk_", "hsa_"] as const;

const TRACKING_PARAMETERS = new Set([
  "fbclid",
  "gclid",
  "gclsrc",
  "dclid",
  "gbraid",
  "wbraid",
  "msclkid",
  "ttclid",
  "twclid",
  "li_fat_id",
  "igshid",
  "yclid",
  "mc_cid",
  "mc_eid",
  "_hsenc",
  "_hsmi",
  "_ga",
  "_gl",
  "oly_anon_id",
  "oly_enc_id",
  "vero_id",
  "wickedid",
  "s_kwcid",
  "ref_src",
  "spm",
]);

export function isTrackingParameter(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    TRACKING_PARAMETERS.has(lower) || TRACKING_PARAMETER_PREFIXES.some((p) => lower.startsWith(p))
  );
}

/** Throws (`TypeError`) on an invalid URL; callers validate with Zod first. */
export function canonicalizeUrl(raw: string): string {
  const url = new URL(raw);
  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";
  if (
    (url.protocol === "https:" && url.port === "443") ||
    (url.protocol === "http:" && url.port === "80")
  ) {
    url.port = "";
  }
  const kept = [...url.searchParams.entries()].filter(([name]) => !isTrackingParameter(name));
  kept.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  url.search = "";
  for (const [name, value] of kept) url.searchParams.append(name, value);
  return url.toString();
}
