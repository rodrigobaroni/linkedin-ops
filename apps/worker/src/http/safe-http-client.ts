/**
 * Outbound HTTP client for untrusted URLs (ADR-0008 §5; shared with RSS sources later, TM-08). Per hop:
 * validate the URL, resolve the host once, refuse any non-public address, and connect to exactly that address
 * (the socket's `lookup` returns the pinned IP; TLS still verifies the certificate against the hostname), so
 * nothing re-resolves between the check and the connection. Redirects are followed by hand, at most 3, each one
 * revalidated and passed through the caller's `beforeHop` policy. No cookie jar (`Set-Cookie` is never read), no
 * `Authorization`, a fixed user agent. Errors carry a code and the HTTP status only, never the response or URL.
 */
import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { AddressPolicy } from "./address-policy.js";

export type SafeHttpErrorCode =
  | "ssrf_blocked"
  | "too_large"
  | "timeout"
  | "not_html"
  | "http_status"
  | "redirect_limit"
  | "network"
  | "aborted";

export class SafeHttpError extends Error {
  readonly code: SafeHttpErrorCode;
  /** Set for `http_status`. */
  readonly status: number | null;

  constructor(code: SafeHttpErrorCode, status: number | null = null) {
    super(
      status === null
        ? `Safe HTTP request failed: ${code}`
        : `Safe HTTP request failed: ${code} ${status}`,
    );
    this.name = "SafeHttpError";
    this.code = code;
    this.status = status;
  }
}

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export type Resolver = (hostname: string) => Promise<ResolvedAddress[]>;

export const systemResolver: Resolver = async (hostname) =>
  (await dnsLookup(hostname, { all: true, order: "verbatim" })).map((entry) => ({
    address: entry.address,
    family: entry.family === 6 ? 6 : 4,
  }));

export interface SafeHttpClientOptions {
  /** Fixed, identifiable user agent (ADR-0008 §3). */
  userAgent: string;
  resolver?: Resolver;
  addressPolicy?: Pick<AddressPolicy, "allowsHostname" | "allowsAddress">;
  /** ADR-0008 §5: 80 and 443. Tests that talk to a local server widen it. */
  allowedPorts?: readonly number[];
  maxRedirects?: number;
  /** Decoded body limit; the encoded body is held to the same limit. */
  maxBodyBytes?: number;
  /** Network time budget of the whole redirect chain (time spent in `beforeHop` does not count). */
  timeoutMs?: number;
}

export interface SafeHttpGetOptions {
  signal: AbortSignal;
  /**
   * Runs before each request is sent, with the URL about to be requested: the original URL (`hop` 0) and every
   * redirect target. Throwing stops the chain; nothing is sent for that hop. Returning a URL sends that one
   * instead (a normalized form), revalidated with the same rules.
   */
  beforeHop?: (url: URL, hop: number) => Promise<URL | undefined>;
}

export interface SafeHttpResponse {
  /** URL of the last hop (the one that answered 2xx). */
  url: URL;
  status: number;
  /** Media type without parameters, lowercased. */
  contentType: string;
  body: string;
}

export const SAFE_HTTP_MAX_REDIRECTS = 3;
export const SAFE_HTTP_MAX_BODY_BYTES = 2 * 1024 * 1024;
export const SAFE_HTTP_TIMEOUT_MS = 15_000;
const ACCEPTED_CONTENT_TYPES = new Set(["text/html", "text/plain", "application/xhtml+xml"]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export class SafeHttpClient {
  private readonly resolver: Resolver;
  private readonly policy: Pick<AddressPolicy, "allowsHostname" | "allowsAddress">;
  private readonly allowedPorts: readonly number[];
  private readonly maxRedirects: number;
  private readonly maxBodyBytes: number;
  private readonly timeoutMs: number;

  constructor(private readonly options: SafeHttpClientOptions) {
    this.resolver = options.resolver ?? systemResolver;
    this.policy = options.addressPolicy ?? new AddressPolicy();
    this.allowedPorts = options.allowedPorts ?? [80, 443];
    this.maxRedirects = options.maxRedirects ?? SAFE_HTTP_MAX_REDIRECTS;
    this.maxBodyBytes = options.maxBodyBytes ?? SAFE_HTTP_MAX_BODY_BYTES;
    this.timeoutMs = options.timeoutMs ?? SAFE_HTTP_TIMEOUT_MS;
  }

  async get(input: string, options: SafeHttpGetOptions): Promise<SafeHttpResponse> {
    let url = this.validateUrl(input);
    let networkMs = 0;
    for (let hop = 0; ; hop += 1) {
      if (options.signal.aborted) throw new SafeHttpError("aborted");
      const replaced = await options.beforeHop?.(url, hop);
      if (replaced !== undefined) url = this.validateUrl(replaced.href);
      const started = Date.now();
      const remaining = this.timeoutMs - networkMs;
      if (remaining <= 0) throw new SafeHttpError("timeout");
      const result = await this.sendHop(url, options.signal, remaining);
      networkMs += Date.now() - started;
      if (result.kind === "response") return result.response;
      if (hop >= this.maxRedirects) throw new SafeHttpError("redirect_limit");
      url = this.validateUrl(result.location, url);
    }
  }

  private validateUrl(input: string, base?: URL): URL {
    let url: URL;
    try {
      url = new URL(input, base);
    } catch {
      throw new SafeHttpError("ssrf_blocked");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:")
      throw new SafeHttpError("ssrf_blocked");
    if (url.username !== "" || url.password !== "") throw new SafeHttpError("ssrf_blocked");
    const port = url.port === "" ? (url.protocol === "https:" ? 443 : 80) : Number(url.port);
    if (!this.allowedPorts.includes(port)) throw new SafeHttpError("ssrf_blocked");
    if (!this.policy.allowsHostname(url.hostname)) throw new SafeHttpError("ssrf_blocked");
    url.hash = "";
    return url;
  }

  /** Resolves once, refuses the hop if ANY address is not public, and pins the connection to the first. */
  private async pin(hostname: string): Promise<ResolvedAddress> {
    let addresses: ResolvedAddress[];
    try {
      addresses = await this.resolver(hostname);
    } catch {
      throw new SafeHttpError("network");
    }
    const [first] = addresses;
    if (!first || addresses.some((entry) => !this.policy.allowsAddress(entry.address))) {
      throw new SafeHttpError("ssrf_blocked");
    }
    return first;
  }

  private async sendHop(
    url: URL,
    signal: AbortSignal,
    budgetMs: number,
  ): Promise<
    { kind: "response"; response: SafeHttpResponse } | { kind: "redirect"; location: string }
  > {
    const pinned = await this.pin(url.hostname);
    const timeout = AbortSignal.timeout(budgetMs);
    const hopSignal = AbortSignal.any([signal, timeout]);
    const lookup: LookupFunction = (_hostname, lookupOptions, callback) => {
      if (lookupOptions.all) callback(null, [pinned]);
      else callback(null, pinned.address, pinned.family);
    };
    const request = url.protocol === "https:" ? httpsRequest : httpRequest;
    const failure = (error: unknown): SafeHttpError => {
      if (error instanceof SafeHttpError) return error;
      if (signal.aborted) return new SafeHttpError("aborted");
      if (timeout.aborted) return new SafeHttpError("timeout");
      return new SafeHttpError("network");
    };

    return new Promise((resolve, reject) => {
      const req = request(
        url,
        {
          method: "GET",
          agent: false,
          lookup,
          signal: hopSignal,
          headers: {
            "user-agent": this.options.userAgent,
            accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
            "accept-encoding": "gzip, deflate, br",
            "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
          },
        },
        (res) => {
          const status = res.statusCode ?? 0;
          if (REDIRECT_STATUSES.has(status) && typeof res.headers.location === "string") {
            res.resume();
            resolve({ kind: "redirect", location: res.headers.location });
            return;
          }
          if (status < 200 || status >= 300) {
            res.resume();
            reject(new SafeHttpError("http_status", status));
            return;
          }
          this.readBody(res)
            .then((body) =>
              resolve({
                kind: "response",
                response: { url, status, contentType: mediaType(res), body },
              }),
            )
            .catch((error: unknown) => {
              res.destroy();
              reject(failure(error));
            });
        },
      );
      req.on("error", (error) => reject(failure(error)));
      req.end();
    });
  }

  private async readBody(res: IncomingMessage): Promise<string> {
    if (!ACCEPTED_CONTENT_TYPES.has(mediaType(res))) throw new SafeHttpError("not_html");
    const limit = this.maxBodyBytes;
    const declared = Number(res.headers["content-length"] ?? Number.NaN);
    if (Number.isFinite(declared) && declared > limit) throw new SafeHttpError("too_large");

    // Both the bytes on the wire and the decompressed bytes are held to the limit (gzip bomb).
    const encoded = byteLimit(limit);
    const decoder = decoderFor(res.headers["content-encoding"]);
    const chunks: Buffer[] = [];
    const collect = async (source: AsyncIterable<Buffer>): Promise<void> => {
      let decodedBytes = 0;
      for await (const chunk of source) {
        decodedBytes += chunk.length;
        if (decodedBytes > limit) throw new SafeHttpError("too_large");
        chunks.push(chunk);
      }
    };
    if (decoder === null) await pipeline(res, encoded, collect);
    else await pipeline(res, encoded, decoder, collect);
    return decodeText(Buffer.concat(chunks), res);
  }
}

function mediaType(res: IncomingMessage): string {
  return (res.headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

function byteLimit(limit: number): Transform {
  let bytes = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > limit) callback(new SafeHttpError("too_large"));
      else callback(null, chunk);
    },
  });
}

/** `null` = identity. An unknown encoding cannot be read as text. */
function decoderFor(header: string | undefined): Transform | null {
  switch ((header ?? "identity").trim().toLowerCase()) {
    case "identity":
    case "":
      return null;
    case "gzip":
    case "x-gzip":
      return createGunzip();
    case "deflate":
      return createInflate();
    case "br":
      return createBrotliDecompress();
    default:
      throw new SafeHttpError("not_html");
  }
}

function decodeText(body: Buffer, res: IncomingMessage): string {
  const charset = /charset\s*=\s*"?([\w-]+)/i.exec(res.headers["content-type"] ?? "")?.[1];
  try {
    return new TextDecoder(charset ?? "utf-8").decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}
