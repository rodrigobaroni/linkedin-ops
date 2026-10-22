import {
  createServer,
  type IncomingHttpHeaders,
  type RequestListener,
  type Server,
} from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { AddressPolicy } from "../src/http/address-policy.js";
import {
  SAFE_HTTP_MAX_BODY_BYTES,
  SafeHttpClient,
  SafeHttpError,
  type ResolvedAddress,
  type SafeHttpClientOptions,
} from "../src/http/safe-http-client.js";

const USER_AGENT = "LinkedInOpsJobFetcher/test (self-hosted; single user)";

/** The real policy, except that 127.0.0.1 counts as public so a local server can stand in for a site. */
const real = new AddressPolicy();
const localAsPublic = {
  allowsHostname: (hostname: string) => real.allowsHostname(hostname),
  allowsAddress: (address: string) => address === "127.0.0.1" || real.allowsAddress(address),
};

interface Recorded {
  path: string;
  headers: IncomingHttpHeaders;
}

let server: Server | null = null;
let port = 0;
let requests: Recorded[] = [];

async function serve(handler: RequestListener): Promise<void> {
  requests = [];
  server = createServer((req, res) => {
    requests.push({ path: req.url ?? "", headers: req.headers });
    handler(req, res);
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
}

afterEach(async () => {
  server?.closeAllConnections();
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = null;
});

/** Fake DNS: each host answers its queue in order (the last answer repeats). Records every lookup. */
function fakeDns(answers: Record<string, string[][]>) {
  const lookups: string[] = [];
  const resolver = (hostname: string): Promise<ResolvedAddress[]> => {
    lookups.push(hostname);
    const queue = answers[hostname];
    if (!queue) return Promise.reject(new Error("ENOTFOUND"));
    const answer = queue.length > 1 ? (queue.shift() as string[]) : (queue[0] as string[]);
    return Promise.resolve(
      answer.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }) as const),
    );
  };
  return { resolver, lookups };
}

function client(options: Partial<SafeHttpClientOptions> = {}, dns = fakeDns({})) {
  return new SafeHttpClient({
    userAgent: USER_AGENT,
    resolver: dns.resolver,
    addressPolicy: localAsPublic,
    allowedPorts: [80, 443, port],
    ...options,
  });
}

const signal = () => new AbortController().signal;
const site = (path = "/job", host = "jobs.example.test") => `http://${host}:${port}${path}`;
const local = (...hosts: string[]) =>
  fakeDns(Object.fromEntries(hosts.map((host) => [host, [["127.0.0.1"]]])));

async function failure(promise: Promise<unknown>): Promise<SafeHttpError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(SafeHttpError);
  return error as SafeHttpError;
}

const html =
  (body: string): RequestListener =>
  (_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(body);
  };

describe("SafeHttpClient: happy path and identity", () => {
  it("returns the body with a fixed user agent and no cookie or authorization", async () => {
    await serve(html("<p>Vaga</p>"));
    const response = await client({}, local("jobs.example.test")).get(site(), {
      signal: signal(),
    });
    expect(response).toMatchObject({ status: 200, contentType: "text/html", body: "<p>Vaga</p>" });
    const [sent] = requests;
    expect(sent?.headers["user-agent"]).toBe(USER_AGENT);
    expect(sent?.headers.cookie).toBeUndefined();
    expect(sent?.headers.authorization).toBeUndefined();
  });

  it("never sends back a Set-Cookie it received on a redirect", async () => {
    await serve((req, res) => {
      if (req.url === "/start") {
        res.writeHead(302, { location: "/job", "set-cookie": "li_at=canary-secret; Path=/" });
        res.end();
        return;
      }
      html("ok")(req, res);
    });
    await client({}, local("jobs.example.test")).get(site("/start"), { signal: signal() });
    expect(requests.map((r) => r.path)).toEqual(["/start", "/job"]);
    for (const request of requests) {
      expect(JSON.stringify(request.headers)).not.toContain("canary-secret");
      expect(request.headers.cookie).toBeUndefined();
    }
  });

  it("decodes the declared charset", async () => {
    await serve((_req, res) => {
      res.writeHead(200, { "content-type": "text/html; charset=iso-8859-1" });
      res.end(Buffer.from([0x41, 0xe7, 0xe3, 0x6f]));
    });
    const response = await client({}, local("jobs.example.test")).get(site(), {
      signal: signal(),
    });
    expect(response.body).toBe("Ação");
  });
});

describe("SafeHttpClient: SSRF", () => {
  it.each([
    ["an IPv4 literal", () => `http://127.0.0.1:${port}/`],
    ["a hex IPv4 literal", () => `http://0x7f000001:${port}/`],
    ["an IPv6 literal", () => `http://[::1]:${port}/`],
    ["localhost", () => `http://localhost:${port}/`],
    ["a single-label name", () => `http://metadata:${port}/`],
    ["the GCP metadata name", () => `http://metadata.google.internal:${port}/`],
    ["credentials in the URL", () => `http://user:pass@jobs.example.test:${port}/`],
    ["a non-http scheme", () => "file:///etc/passwd"],
  ])("refuses %s without resolving or connecting", async (_name, url) => {
    await serve(html("never"));
    const dns = local("jobs.example.test", "metadata.google.internal", "metadata", "localhost");
    const error = await failure(client({}, dns).get(url(), { signal: signal() }));
    expect(error.code).toBe("ssrf_blocked");
    expect(dns.lookups).toEqual([]);
    expect(requests).toEqual([]);
  });

  it("refuses a non-standard port by default", async () => {
    await serve(html("never"));
    const dns = local("jobs.example.test");
    const strict = client({ allowedPorts: undefined }, dns);
    expect((await failure(strict.get(site(), { signal: signal() }))).code).toBe("ssrf_blocked");
    expect(requests).toEqual([]);
  });

  it.each([
    ["10.0.0.1.nip.io", ["10.0.0.1"]],
    ["metadata.example.test", ["169.254.169.254"]],
    ["docker.example.test", ["172.17.0.2"]],
    ["cgnat.example.test", ["100.64.1.1"]],
    ["mapped.example.test", ["::ffff:127.0.0.1"]],
    ["ula.example.test", ["fd00::1"]],
    ["mixed.example.test", ["127.0.0.1", "192.168.1.10"]],
  ])("refuses %s after resolution (%j)", async (host, addresses) => {
    await serve(html("never"));
    const dns = fakeDns({ [host]: [addresses] });
    const error = await failure(client({}, dns).get(site("/", host), { signal: signal() }));
    expect(error.code).toBe("ssrf_blocked");
    expect(requests).toEqual([]);
  });

  it("refuses the configured Docker/VM networks", async () => {
    const policy = new AddressPolicy({ extraBlockedCidrs: ["203.0.0.0/16"] });
    expect(new AddressPolicy().allowsAddress("203.0.1.1")).toBe(true);
    expect(policy.allowsAddress("203.0.1.1")).toBe(false);
    expect(policy.allowsAddress("8.8.8.8")).toBe(true);
  });

  it("refuses a redirect to a private address, metadata or an IP literal", async () => {
    await serve((req, res) => {
      const targets: Record<string, string> = {
        "/to-private": `http://inside.example.test:${port}/`,
        "/to-metadata": "http://169.254.169.254/latest/meta-data/",
        "/to-literal": `http://127.0.0.1:${port}/`,
      };
      res.writeHead(302, { location: targets[req.url ?? ""] ?? "/" });
      res.end();
    });
    const dns = fakeDns({
      "jobs.example.test": [["127.0.0.1"]],
      "inside.example.test": [["10.1.2.3"]],
    });
    for (const path of ["/to-private", "/to-metadata", "/to-literal"]) {
      const error = await failure(client({}, dns).get(site(path), { signal: signal() }));
      expect(error.code).toBe("ssrf_blocked");
    }
    expect(requests.map((r) => r.path)).toEqual(["/to-private", "/to-metadata", "/to-literal"]);
  });

  it("resolves once per hop and connects to the validated address (DNS rebinding)", async () => {
    await serve((req, res) => {
      if (req.url === "/first") {
        res.writeHead(302, { location: "/second" });
        res.end();
        return;
      }
      html("never")(req, res);
    });
    // Public on the first lookup, private on the next: the first hop connects to the first answer only.
    const dns = fakeDns({ "rebind.example.test": [["127.0.0.1"], ["10.0.0.7"]] });
    const error = await failure(
      client({}, dns).get(site("/first", "rebind.example.test"), { signal: signal() }),
    );
    expect(error.code).toBe("ssrf_blocked");
    expect(dns.lookups).toEqual(["rebind.example.test", "rebind.example.test"]);
    expect(requests.map((r) => r.path)).toEqual(["/first"]);
  });
});

describe("SafeHttpClient: limits", () => {
  const redirectChain =
    (length: number): RequestListener =>
    (req, res) => {
      const step = Number(/^\/r(\d+)$/.exec(req.url ?? "")?.[1] ?? Number.NaN);
      if (step < length) {
        res.writeHead(301, { location: `/r${step + 1}` });
        res.end();
        return;
      }
      html("end")(req, res);
    };

  it("follows 3 redirects and refuses the 4th", async () => {
    await serve(redirectChain(3));
    const ok = await client({}, local("jobs.example.test")).get(site("/r0"), { signal: signal() });
    expect(ok.url.pathname).toBe("/r3");

    await new Promise<void>((resolve) => server?.close(() => resolve()));
    await serve(redirectChain(4));
    const error = await failure(
      client({}, local("jobs.example.test")).get(site("/r0"), { signal: signal() }),
    );
    expect(error.code).toBe("redirect_limit");
    expect(requests).toHaveLength(4);
  });

  it("calls beforeHop with every hop and sends nothing for a hop it refuses", async () => {
    await serve(redirectChain(2));
    const seen: string[] = [];
    const error = await client({}, local("jobs.example.test"))
      .get(site("/r0"), {
        signal: signal(),
        beforeHop: (url, hop) => {
          seen.push(`${hop}:${url.pathname}`);
          return hop === 2 ? Promise.reject(new Error("policy")) : Promise.resolve();
        },
      })
      .catch((caught: unknown) => caught);
    expect((error as Error).message).toBe("policy");
    expect(seen).toEqual(["0:/r0", "1:/r1", "2:/r2"]);
    expect(requests.map((r) => r.path)).toEqual(["/r0", "/r1"]);
  });

  it("accepts exactly 2 MB and refuses 2 MB + 1 byte", async () => {
    let size = SAFE_HTTP_MAX_BODY_BYTES;
    await serve((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("a".repeat(size));
    });
    const http = client({}, local("jobs.example.test"));
    expect((await http.get(site(), { signal: signal() })).body).toHaveLength(size);
    size += 1;
    expect((await failure(http.get(site(), { signal: signal() }))).code).toBe("too_large");
  });

  it("refuses an oversized chunked body (no content-length)", async () => {
    await serve((_req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      const chunk = "b".repeat(64 * 1024);
      for (let i = 0; i < 40; i += 1) res.write(chunk);
      res.end();
    });
    const error = await failure(
      client({}, local("jobs.example.test")).get(site(), { signal: signal() }),
    );
    expect(error.code).toBe("too_large");
  });

  it("counts decompressed bytes (gzip bomb)", async () => {
    const bomb = gzipSync(Buffer.alloc(8 * 1024 * 1024));
    expect(bomb.length).toBeLessThan(64 * 1024);
    await serve((_req, res) => {
      res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" });
      res.end(bomb);
    });
    const error = await failure(
      client({}, local("jobs.example.test")).get(site(), { signal: signal() }),
    );
    expect(error.code).toBe("too_large");
  });

  it("decodes a gzip body within the limit", async () => {
    await serve((_req, res) => {
      res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" });
      res.end(gzipSync("<p>comprimido</p>"));
    });
    const response = await client({}, local("jobs.example.test")).get(site(), {
      signal: signal(),
    });
    expect(response.body).toBe("<p>comprimido</p>");
  });

  it("times out a server that never answers", async () => {
    await serve(() => undefined);
    const error = await failure(
      client({ timeoutMs: 150 }, local("jobs.example.test")).get(site(), { signal: signal() }),
    );
    expect(error.code).toBe("timeout");
  });

  it("does not count time spent in beforeHop against the network budget", async () => {
    await serve(redirectChain(1));
    const response = await client({ timeoutMs: 150 }, local("jobs.example.test")).get(site("/r0"), {
      signal: signal(),
      beforeHop: () => new Promise((resolve) => setTimeout(resolve, 200)),
    });
    expect(response.body).toBe("end");
  });

  it("refuses a content type that is not HTML or plain text", async () => {
    await serve((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    });
    const error = await failure(
      client({}, local("jobs.example.test")).get(site(), { signal: signal() }),
    );
    expect(error.code).toBe("not_html");
  });

  it("reports a non-2xx status without the body", async () => {
    await serve((_req, res) => {
      res.writeHead(429, { "content-type": "text/html" });
      res.end("<p>secret page body</p>");
    });
    const error = await failure(
      client({}, local("jobs.example.test")).get(site(), { signal: signal() }),
    );
    expect(error).toMatchObject({ code: "http_status", status: 429 });
    expect(error.message).not.toContain("secret");
    expect(error.message).not.toContain("jobs.example.test");
  });

  it("stops when the caller aborts", async () => {
    await serve(() => undefined);
    const controller = new AbortController();
    const pending = client({}, local("jobs.example.test")).get(site(), {
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 50);
    expect((await failure(pending)).code).toBe("aborted");
  });
});
