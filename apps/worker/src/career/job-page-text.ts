/**
 * Main text of a job page (ADR-0008 §6). `parse5` is used as a parser only: no DOM with scripts, nothing is
 * executed or fetched. The page is reduced to the posting's text before anything is stored; everything in it,
 * JSON-LD included, is untrusted data that later enters prompts only as delimited data (TM-09). Recognizes a
 * login wall or CAPTCHA, which is a stop signal (ADR-0008 §4).
 *
 * Hostile markup (QA #104): parse5's cost grows quadratically with nesting depth, so every string is pre-scanned
 * in linear time against element and depth ceilings before it is parsed, and every tree walk is iterative with a
 * depth ceiling. The fetcher runs this module in a worker thread with a hard timeout
 * (`job-page-text-runner.ts`). It must keep importing only `parse5` (and only erasable TypeScript): the worker
 * loads it directly.
 */
import { parse, parseFragment, type DefaultTreeAdapterTypes } from "parse5";

type Node = DefaultTreeAdapterTypes.Node;
type Element = DefaultTreeAdapterTypes.Element;

export type JobPageText =
  | { kind: "text"; text: string }
  /** Login form, authwall or CAPTCHA instead of the posting. */
  | { kind: "login_wall" }
  /** Nothing readable (blank page, app shell that renders with JavaScript). */
  | { kind: "empty" }
  /** Markup over the element or depth ceiling, or extraction that did not finish (worker timeout or crash). */
  | { kind: "unreadable" };

/** Real job pages use a few thousand elements and nest well under 100 levels. */
export const MAX_MARKUP_ELEMENTS = 100_000;
/** Depth as counted by `prescanMarkup` (elements that close implicitly do not count). */
export const MAX_MARKUP_DEPTH = 256;
/** Tree walks ignore anything deeper (a backstop: the pre-scan already bounds the parser's depth). */
const MAX_TREE_DEPTH = 1_024;

/** Never part of the main text. */
const SKIPPED = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "iframe",
  "object",
  "nav",
  "header",
  "footer",
  "form",
  "button",
  "select",
  "textarea",
  "head",
]);
const BLOCKS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "br",
  "dd",
  "div",
  "dl",
  "dt",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "li",
  "main",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "td",
  "th",
  "tr",
  "ul",
]);
const CAPTCHA_MARKER =
  /g-recaptcha|recaptcha\/api|h-captcha|hcaptcha\.com|cf-challenge|challenges\.cloudflare\.com|cf-turnstile|captcha-delivery/i;
/** Below this, a page with a password field is a login page, not a posting with a login widget. */
const LOGIN_PAGE_MAX_TEXT = 600;
/** A main/article/description block shorter than this falls back to the whole body. */
const MIN_BLOCK_TEXT = 200;
const MAX_JSON_LD_CHARS = 200_000;

class MarkupLimitError extends Error {
  constructor() {
    super("Markup over the extraction limits");
    this.name = "MarkupLimitError";
  }
}

export function extractJobPageText(body: string, contentType: string): JobPageText {
  if (contentType === "text/plain") {
    const text = tidy(body);
    return text === "" ? { kind: "empty" } : { kind: "text", text };
  }
  try {
    return extractHtml(body);
  } catch (error) {
    if (error instanceof MarkupLimitError || error instanceof RangeError)
      return { kind: "unreadable" };
    throw error;
  }
}

function extractHtml(body: string): JobPageText {
  const document = parse(prescanned(body));
  const posting = jsonLdPosting(document);
  const root = find(document, (el) => el.tagName === "body") ?? document;
  const main = mainText(root);

  if (posting === null && looksLikeLoginWall(document, main)) return { kind: "login_wall" };
  const text = posting !== null && posting.length >= main.length / 2 ? posting : main;
  return text === "" ? { kind: "empty" } : { kind: "text", text };
}

/** Void elements and elements the parser closes implicitly: they never deepen the tree by themselves. */
const NON_NESTING = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
  "keygen",
  "p",
  "li",
  "dt",
  "dd",
  "option",
  "optgroup",
  "tr",
  "td",
  "th",
  "thead",
  "tbody",
  "tfoot",
  "colgroup",
  "caption",
  "rb",
  "rt",
  "rp",
]);
/** Their content is raw text up to the matching end tag: skipped by the pre-scan like the parser does. */
const RAW_TEXT = new Set([
  "script",
  "style",
  "textarea",
  "title",
  "xmp",
  "noscript",
  "iframe",
  "noembed",
]);
/** `[^<>]*` keeps every attempt bounded by the next `<`, so a run of `<a` without `>` stays linear. */
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)[^<>]*>/g;

/**
 * Linear pre-scan of `html` against the ceilings, mirroring the parser closely enough to over-estimate depth,
 * never to under-estimate it: an end tag only closes an element that is open (an unmatched `</span>` closes
 * nothing, as in the parser), `<div/>` opens a `div` (HTML has no self-closing elements), and a raw-text
 * element's content is skipped. Returns `html` unchanged; throws `MarkupLimitError`.
 */
export function prescanned(html: string): string {
  const lower = html.toLowerCase();
  const open: string[] = [];
  let elements = 0;
  TAG.lastIndex = 0;
  for (let match = TAG.exec(html); match !== null; match = TAG.exec(html)) {
    const name = (match[2] as string).toLowerCase();
    if (match[1] === "/") {
      const at = open.lastIndexOf(name);
      if (at !== -1) open.length = at;
      continue;
    }
    elements += 1;
    if (elements > MAX_MARKUP_ELEMENTS) throw new MarkupLimitError();
    if (RAW_TEXT.has(name)) {
      const end = lower.indexOf(`</${name}`, TAG.lastIndex);
      if (end === -1) break;
      TAG.lastIndex = end;
      continue;
    }
    if (NON_NESTING.has(name)) continue;
    open.push(name);
    if (open.length > MAX_MARKUP_DEPTH) throw new MarkupLimitError();
  }
  return html;
}

function looksLikeLoginWall(document: Node, main: string): boolean {
  let captcha = false;
  let password = false;
  walk(document, (el) => {
    const marker = [attr(el, "class"), attr(el, "id"), attr(el, "src"), attr(el, "action")].join(
      " ",
    );
    if (CAPTCHA_MARKER.test(marker)) captcha = true;
    if (el.tagName === "input" && attr(el, "type")?.toLowerCase() === "password") password = true;
    return true;
  });
  return captcha || (password && main.length < LOGIN_PAGE_MAX_TEXT);
}

function isMainCandidate(el: Element): boolean {
  return (
    el.tagName === "main" ||
    el.tagName === "article" ||
    attr(el, "role") === "main" ||
    (attr(el, "class")?.toLowerCase() ?? "").includes("description")
  );
}

/**
 * Prefers the longest `main`, `article`, `[role=main]` or `[class*=description]` block; else the body. Only the
 * outermost candidates are measured: a nested candidate's text is part of its ancestor's, so it can never be
 * longer, and measuring disjoint subtrees keeps this linear.
 */
function mainText(root: Node): string {
  let best = "";
  walk(root, (el) => {
    if (SKIPPED.has(el.tagName) || isHidden(el)) return false;
    if (!isMainCandidate(el)) return true;
    const text = textOf(el);
    if (text.length > best.length) best = text;
    return false;
  });
  return best.length >= MIN_BLOCK_TEXT ? best : textOf(root);
}

/** Title, hiring organization and description of the first `JobPosting` in JSON-LD, as plain text. */
function jsonLdPosting(document: Node): string | null {
  let result: string | null = null;
  walk(document, (el) => {
    if (result !== null) return false;
    if (el.tagName !== "script" || attr(el, "type")?.toLowerCase() !== "application/ld+json") {
      return true;
    }
    const raw = rawText(el);
    if (raw.length > MAX_JSON_LD_CHARS) return false;
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return false;
    }
    const posting = findJobPosting(data);
    if (posting === null) return false;
    const description =
      typeof posting.description === "string" ? htmlToText(posting.description) : "";
    if (description === "") return false;
    const organization = posting.hiringOrganization;
    const parts = [
      typeof posting.title === "string" ? tidy(posting.title) : "",
      isRecord(organization) && typeof organization.name === "string"
        ? tidy(organization.name)
        : "",
      description,
    ];
    result = parts.filter((part) => part !== "").join("\n\n");
    return false;
  });
  return result;
}

/** Breadth-limited search: top level, arrays and `@graph`, at most 4 levels down. */
function findJobPosting(root: unknown): Record<string, unknown> | null {
  let level: unknown[] = [root];
  for (let depth = 0; depth <= 4 && level.length > 0; depth += 1) {
    const next: unknown[] = [];
    for (const data of level) {
      if (Array.isArray(data)) {
        next.push(...data.slice(0, 100));
        continue;
      }
      if (!isRecord(data)) continue;
      const type = data["@type"];
      if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting")))
        return data;
      if (data["@graph"] !== undefined) next.push(data["@graph"]);
    }
    level = next;
  }
  return null;
}

/** JSON-LD descriptions are HTML, often entity-escaped once more (`&lt;p&gt;`): decode at most twice. */
function htmlToText(html: string): string {
  const once = textOf(parseFragment(prescanned(html)));
  return /<\/?[a-z][^<>]*>/i.test(once) ? textOf(parseFragment(prescanned(once))) : once;
}

/** Iterative: an explicit stack of nodes and block-end markers, children in document order. */
function textOf(node: Node): string {
  const out: string[] = [];
  const stack: (readonly [Node, number] | "end-block")[] = [[node, 0]];
  while (stack.length > 0) {
    const entry = stack.pop() as readonly [Node, number] | "end-block";
    if (entry === "end-block") {
      out.push("\n");
      continue;
    }
    const [current, depth] = entry;
    if (current.nodeName === "#text") {
      out.push((current as DefaultTreeAdapterTypes.TextNode).value);
      continue;
    }
    if (!("childNodes" in current) || depth > MAX_TREE_DEPTH) continue;
    const el = "tagName" in current ? current : null;
    if (el && (SKIPPED.has(el.tagName) || isHidden(el))) continue;
    const block = el !== null && BLOCKS.has(el.tagName);
    if (block) {
      out.push("\n");
      stack.push("end-block");
    }
    if (el?.tagName === "li") out.push("- ");
    const children = current.childNodes;
    for (let i = children.length - 1; i >= 0; i -= 1) {
      stack.push([children[i] as Node, depth + 1]);
    }
  }
  return tidy(out.join(""));
}

/** Collapses spaces inside lines and runs of blank lines; trims. */
function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t\f\v \u00a0]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function rawText(el: Element): string {
  return el.childNodes
    .map((child) =>
      child.nodeName === "#text" ? (child as DefaultTreeAdapterTypes.TextNode).value : "",
    )
    .join("");
}

function isHidden(el: Element): boolean {
  return attr(el, "hidden") !== undefined || attr(el, "aria-hidden") === "true";
}

function attr(el: Element, name: string): string | undefined {
  return el.attrs.find((a) => a.name === name)?.value;
}

/**
 * Iterative depth-first walk over elements in document order; `visit` returns false to skip an element's
 * children. Elements deeper than `MAX_TREE_DEPTH` are not visited.
 */
function walk(node: Node, visit: (el: Element) => boolean): void {
  const stack: [Node, number][] = [[node, 0]];
  while (stack.length > 0) {
    const [current, depth] = stack.pop() as [Node, number];
    if (depth > MAX_TREE_DEPTH) continue;
    if ("tagName" in current && !visit(current)) continue;
    if (!("childNodes" in current)) continue;
    const children = current.childNodes;
    for (let i = children.length - 1; i >= 0; i -= 1) {
      stack.push([children[i] as Node, depth + 1]);
    }
  }
}

function find(node: Node, predicate: (el: Element) => boolean): Element | null {
  let found: Element | null = null;
  walk(node, (el) => {
    if (found) return false;
    if (predicate(el)) {
      found = el;
      return false;
    }
    return true;
  });
  return found;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
