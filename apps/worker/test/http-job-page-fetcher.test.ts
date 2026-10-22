import { readFileSync } from "node:fs";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Writable } from "node:stream";
import { pino } from "pino";
import { afterEach, describe, expect, it } from "vitest";
import { InMemoryFetchDomainGuard, type FetchDomainGuard } from "@linkedin-ops/domain";
import { AddressPolicy } from "../src/http/address-policy.js";
import {
  SafeHttpError,
  type SafeHttpClient,
  type SafeHttpResponse,
} from "../src/http/safe-http-client.js";
import { HttpJobPageFetcher, JOB_FETCHER_USER_AGENT } from "../src/career/http-job-page-fetcher.js";
import { JobFetchDeferredError, JobFetchError } from "../src/career/ports.js";

const T0 = new Date("2026-10-22T12:00:00.000Z");
const JOB = "https://www.linkedin.com/jobs/view/4012345678";
const page = (name: string) =>
  readFileSync(new URL(`./fixtures/job-pages/${name}.html`, import.meta.url), "utf8");

type Route =
  | { redirect: string }
  | { status?: number; contentType?: string; body: string }
  | { error: SafeHttpError };

/**
 * Stands in for SafeHttpClient (tested on its own against a real server): follows redirects through
 * `beforeHop` exactly like it, so the per-hop policy can be exercised on https://www.linkedin.com URLs.
 */
function simulatedHttp(routes: Record<string, Route>) {
  const sent: string[] = [];
  const http: Pick<SafeHttpClient, "get"> = {
    async get(input, options) {
      let url = new URL(input);
      for (let hop = 0; hop <= 3; hop += 1) {
        url = (await options.beforeHop?.(url, hop)) ?? url;
        sent.push(url.href);
        const route = routes[url.href];
        if (route === undefined) throw new SafeHttpError("http_status", 404);
        if ("error" in route) throw route.error;
        if ("redirect" in route) {
          url = new URL(route.redirect, url);
          continue;
        }
        const response: SafeHttpResponse = {
          url,
          status: route.status ?? 200,
          contentType: route.contentType ?? "text/html",
          body: route.body,
        };
        return response;
      }
      throw new SafeHttpError("redirect_limit");
    },
  };
  return { http, sent };
}

function harness(routes: Record<string, Route>) {
  let now = T0.getTime();
  const clock = () => new Date(now);
  const inner = new InMemoryFetchDomainGuard(clock, { linkedInFetch: "enabled" });
  const granted: string[] = [];
  const tripped: string[] = [];
  const guard: FetchDomainGuard = {
    acquire: async (domain) => {
      const slot = await inner.acquire(domain);
      if (slot.outcome === "granted") granted.push(domain);
      return slot;
    },
    tripBreaker: (domain, signal) => (
      tripped.push(`${domain}:${signal}`),
      inner.tripBreaker(domain, signal)
    ),
  };
  const slept: number[] = [];
  const { http, sent } = simulatedHttp(routes);
  const fetcher = new HttpJobPageFetcher({
    guard,
    http,
    now: clock,
    sleep: (ms) => (slept.push(ms), (now += ms), Promise.resolve()),
  });
  const lines: string[] = [];
  const logger = pino(
    { level: "info" },
    new Writable({
      write(chunk: Buffer, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    }),
  );
  const fetch = (url: string) => fetcher.fetchJobText(url, new AbortController().signal, logger);
  return { fetch, sent, granted, tripped, slept, lines, advance: (ms: number) => (now += ms) };
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error("expected a rejection");
    },
    (error: unknown) => error,
  );
}

describe("HttpJobPageFetcher", () => {
  it("lnkd.in → www.linkedin.com/jobs/view: one attempt, no loop, at most 2 quota units", async () => {
    const h = harness({
      "https://lnkd.in/abc123": { redirect: `${JOB}?trk=public_jobs_share` },
      [JOB]: { body: page("linkedin-public") },
    });
    const { text } = await h.fetch("https://lnkd.in/abc123");
    expect(text).toContain("Pessoa Engenheira de Dados Sênior");
    expect(h.sent).toEqual(["https://lnkd.in/abc123", JOB]);
    expect(h.granted).toEqual(["linkedin.com", "linkedin.com"]);
    expect(h.slept).toEqual([15_000]);
  });

  it("sends a pasted LinkedIn URL normalized", async () => {
    const h = harness({ [JOB]: { body: page("linkedin-public") } });
    await h.fetch(`https://br.linkedin.com/jobs/view/4012345678/?trk=abc&refId=xyz`);
    expect(h.sent).toEqual([JOB]);
  });

  it("a LinkedIn path that is not a job view is permanent and never sent", async () => {
    const h = harness({});
    expect(await rejection(h.fetch("https://www.linkedin.com/in/fulano"))).toEqual(
      new JobFetchError("permanent"),
    );
    expect(h.sent).toEqual([]);
  });

  it.each([429, 999, 403])(
    "HTTP %i: blocked, the breaker opens and the next fetch never touches the site",
    async (status) => {
      const h = harness({
        "https://acme.gupy.io/jobs/1": { error: new SafeHttpError("http_status", status) },
      });
      expect(await rejection(h.fetch("https://acme.gupy.io/jobs/1"))).toMatchObject({
        kind: "blocked",
      });
      expect(h.tripped).toEqual([`gupy.io:http_${status}`]);
      h.advance(60_000);
      expect(await rejection(h.fetch("https://other.gupy.io/jobs/2"))).toMatchObject({
        kind: "blocked",
      });
      expect(h.sent).toEqual(["https://acme.gupy.io/jobs/1"]);
    },
  );

  it("a login wall page is blocked and opens the breaker", async () => {
    const h = harness({ [JOB]: { body: page("login-wall") } });
    expect(await rejection(h.fetch(JOB))).toMatchObject({ kind: "blocked" });
    expect(h.tripped).toEqual(["linkedin.com:login_wall"]);
  });

  it("third party → linkedin.com/authwall: permanent, the LinkedIn breaker stays closed", async () => {
    const h = harness({
      "https://jobs.acme.example/r/1": { redirect: "https://www.linkedin.com/authwall?trk=x" },
    });
    expect(await rejection(h.fetch("https://jobs.acme.example/r/1"))).toEqual(
      new JobFetchError("permanent"),
    );
    expect(h.tripped).toEqual([]);
    expect(h.sent).toEqual(["https://jobs.acme.example/r/1"]);
  });

  it("www.linkedin.com/jobs/view → /authwall: blocked, the LinkedIn breaker opens", async () => {
    const h = harness({ [JOB]: { redirect: "/authwall?trk=x" } });
    expect(await rejection(h.fetch(JOB))).toMatchObject({ kind: "blocked" });
    expect(h.tripped).toEqual(["linkedin.com:login_redirect"]);
  });

  it("hostile markup is permanent without a new request (QA #104)", async () => {
    const h = harness({ "https://jobs.acme.example/deep": { body: "<div>".repeat(400_000) } });
    expect(await rejection(h.fetch("https://jobs.acme.example/deep"))).toEqual(
      new JobFetchError("permanent"),
    );
    expect(h.sent).toEqual(["https://jobs.acme.example/deep"]);
    expect(h.tripped).toEqual([]);
  });

  it("defers when the first hop must wait for the domain interval", async () => {
    const h = harness({ "https://boards.greenhouse.io/g/1": { body: page("greenhouse") } });
    await h.fetch("https://boards.greenhouse.io/g/1");
    h.advance(2_000);
    const error = await rejection(h.fetch("https://boards.greenhouse.io/g/1"));
    expect(error).toBeInstanceOf(JobFetchDeferredError);
    expect((error as JobFetchDeferredError).retryAt).toEqual(new Date(T0.getTime() + 5_000));
    expect(h.sent).toHaveLength(1);
  });

  it("a shortener interstitial and an empty page are permanent", async () => {
    const h = harness({
      "https://lnkd.in/x": {
        body: "<p>This link will take you to a page that is not on LinkedIn</p>",
      },
      "https://lnkd.in./x": {
        body: `<main>${"This link will take you to a page that is not on LinkedIn. ".repeat(10)}</main>`,
      },
      "https://jobs.lever.co/d/1": { body: '<div id="root"></div>' },
    });
    expect(await rejection(h.fetch("https://lnkd.in/x"))).toEqual(new JobFetchError("permanent"));
    h.advance(15_000); // same LinkedIn interval as the hop above
    expect(await rejection(h.fetch("https://lnkd.in./x"))).toEqual(new JobFetchError("permanent"));
    expect(h.sent).toContain("https://lnkd.in./x");
    expect(await rejection(h.fetch("https://jobs.lever.co/d/1"))).toEqual(
      new JobFetchError("permanent"),
    );
  });

  it.each([
    [new SafeHttpError("timeout"), "transient"],
    [new SafeHttpError("http_status", 502), "transient"],
    [new SafeHttpError("ssrf_blocked"), "permanent"],
    [new SafeHttpError("not_html"), "permanent"],
  ] as const)("%s → %s", async (error, kind) => {
    const h = harness({ "https://jobs.acme.example/1": { error } });
    expect(await rejection(h.fetch("https://jobs.acme.example/1"))).toEqual(
      new JobFetchError(kind),
    );
  });

  it("logs domains and outcomes, never the URL, its query or the page", async () => {
    const h = harness({
      "https://lnkd.in/abc123": { redirect: `${JOB}?trk=SECRET-QUERY` },
      [JOB]: { body: page("linkedin-public") },
      "https://jobs.acme.example/private-path?token=SECRET-TOKEN": {
        error: new SafeHttpError("http_status", 429),
      },
    });
    await h.fetch("https://lnkd.in/abc123");
    await rejection(h.fetch("https://jobs.acme.example/private-path?token=SECRET-TOKEN"));
    const log = h.lines.join("\n");
    expect(log).toContain('"fetchDomain":"linkedin.com"');
    for (const leaked of ["SECRET", "abc123", "4012345678", "private-path", "Engenheira"]) {
      expect(log).not.toContain(leaked);
    }
  });
});

describe("HttpJobPageFetcher over the real SafeHttpClient (canary)", () => {
  let server: Server | null = null;

  afterEach(async () => {
    server?.closeAllConnections();
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    server = null;
  });

  it("sends no cookie, token or secret, only the fixed user agent", async () => {
    const canaries: Record<string, string> = {
      LINKEDIN_CLIENT_SECRET: "canary-linkedin-secret",
      LINKEDIN_CLIENT_ID: "canary-linkedin-client-id",
      OPENAI_API_KEY: "sk-canary-openai",
      TOKEN_ENCRYPTION_KEY: "canary-vault-key",
      SESSION_SECRET: "canary-session-secret",
    };
    const previous = Object.fromEntries(Object.keys(canaries).map((k) => [k, process.env[k]]));
    Object.assign(process.env, canaries);
    const seen: { url: string; headers: IncomingHttpHeaders }[] = [];
    try {
      server = createServer((req, res) => {
        seen.push({ url: req.url ?? "", headers: req.headers });
        if (req.url === "/r") {
          res.writeHead(302, { location: "/job", "set-cookie": "session=canary-cookie" });
          res.end();
          return;
        }
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(page("greenhouse"));
      });
      await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
      const port = (server.address() as AddressInfo).port;
      const real = new AddressPolicy();
      let now = T0.getTime();
      const clock = () => new Date(now);
      const fetcher = new HttpJobPageFetcher({
        guard: new InMemoryFetchDomainGuard(clock, { linkedInFetch: "enabled" }),
        now: clock,
        httpOptions: {
          resolver: () => Promise.resolve([{ address: "127.0.0.1", family: 4 }]),
          addressPolicy: {
            allowsHostname: (host) => real.allowsHostname(host),
            allowsAddress: (address) => address === "127.0.0.1",
          },
          allowedPorts: [port],
        },
        // Same domain on the redirect: the in-chain wait advances the fake clock instead of sleeping.
        sleep: (ms) => ((now += ms), Promise.resolve()),
      });
      const { text } = await fetcher.fetchJobText(
        `http://jobs.example.test:${port}/r`,
        new AbortController().signal,
      );
      expect(text).toContain("Staff Backend Engineer");
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
    expect(seen.map((s) => s.url)).toEqual(["/r", "/job"]);
    for (const request of seen) {
      expect(request.headers["user-agent"]).toBe(JOB_FETCHER_USER_AGENT);
      expect(request.headers.cookie).toBeUndefined();
      expect(request.headers.authorization).toBeUndefined();
      const wire = JSON.stringify(request);
      for (const secret of [...Object.values(canaries), "canary-cookie"]) {
        expect(wire).not.toContain(secret);
      }
    }
  });
});
