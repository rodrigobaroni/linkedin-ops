/**
 * Main text of a job page (ADR-0008 §6). `parse5` is used as a parser only: no DOM with scripts, nothing is
 * executed or fetched. The page is reduced to the posting's text before anything is stored; everything in it,
 * JSON-LD included, is untrusted data that later enters prompts only as delimited data (TM-09). Recognizes a
 * login wall or CAPTCHA, which is a stop signal (ADR-0008 §4).
 */
import { parse, parseFragment, type DefaultTreeAdapterTypes } from "parse5";

type Node = DefaultTreeAdapterTypes.Node;
type Element = DefaultTreeAdapterTypes.Element;

export type JobPageText =
  | { kind: "text"; text: string }
  /** Login form, authwall or CAPTCHA instead of the posting. */
  | { kind: "login_wall" }
  /** Nothing readable (blank page, app shell that renders with JavaScript). */
  | { kind: "empty" };

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

export function extractJobPageText(body: string, contentType: string): JobPageText {
  if (contentType === "text/plain") {
    const text = tidy(body);
    return text === "" ? { kind: "empty" } : { kind: "text", text };
  }
  const document = parse(body);
  const posting = jsonLdPosting(document);
  const html = find(document, (el) => el.tagName === "html");
  const root = find(document, (el) => el.tagName === "body") ?? html ?? document;
  const main = mainText(root);

  if (posting === null && looksLikeLoginWall(document, main)) return { kind: "login_wall" };
  const text = posting !== null && posting.length >= main.length / 2 ? posting : main;
  return text === "" ? { kind: "empty" } : { kind: "text", text };
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

/** Prefers the longest `main`, `article`, `[role=main]` or `[class*=description]` block; else the body. */
function mainText(root: Node): string {
  let best = "";
  walk(root, (el) => {
    if (SKIPPED.has(el.tagName) || isHidden(el)) return false;
    const className = attr(el, "class")?.toLowerCase() ?? "";
    if (
      el.tagName === "main" ||
      el.tagName === "article" ||
      attr(el, "role") === "main" ||
      className.includes("description")
    ) {
      const text = textOf(el);
      if (text.length > best.length) best = text;
    }
    return true;
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
    const posting = findJobPosting(data, 0);
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

function findJobPosting(data: unknown, depth: number): Record<string, unknown> | null {
  if (depth > 4) return null;
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findJobPosting(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(data)) return null;
  const type = data["@type"];
  if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) return data;
  return findJobPosting(data["@graph"], depth + 1);
}

/** JSON-LD descriptions are HTML, often entity-escaped once more (`&lt;p&gt;`): decode at most twice. */
function htmlToText(html: string): string {
  const once = textOf(parseFragment(html));
  return /<\/?[a-z][^>]*>/i.test(once) ? textOf(parseFragment(once)) : once;
}

function textOf(node: Node): string {
  const out: string[] = [];
  const visit = (current: Node): void => {
    if (current.nodeName === "#text") {
      out.push((current as DefaultTreeAdapterTypes.TextNode).value);
      return;
    }
    if (!("childNodes" in current)) return;
    const el = "tagName" in current ? current : null;
    if (el && (SKIPPED.has(el.tagName) || isHidden(el))) return;
    const block = el !== null && BLOCKS.has(el.tagName);
    if (block) out.push("\n");
    if (el?.tagName === "li") out.push("- ");
    for (const child of (current as DefaultTreeAdapterTypes.ParentNode).childNodes) visit(child);
    if (block) out.push("\n");
  };
  visit(node);
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

/** Depth-first over elements; `visit` returns false to skip an element's children. */
function walk(node: Node, visit: (el: Element) => boolean): void {
  if ("tagName" in node && !visit(node)) return;
  if (!("childNodes" in node)) return;
  for (const child of node.childNodes) walk(child, visit);
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
