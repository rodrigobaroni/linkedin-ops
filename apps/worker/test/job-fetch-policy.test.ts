import { describe, expect, it } from "vitest";
import {
  InMemoryFetchDomainGuard,
  type FetchDomainGuard,
  type JobFetchLinkedInMode,
} from "@linkedin-ops/domain";
import { SafeHttpError } from "../src/http/safe-http-client.js";
import {
  JobFetchHops,
  classifyFetchFailure,
  isLoginPath,
  normalizeLinkedInUrl,
  type HopEvent,
} from "../src/career/job-fetch-policy.js";
import { JobFetchDeferredError, JobFetchError } from "../src/career/ports.js";

const T0 = new Date("2026-10-22T12:00:00.000Z");

/** Guard over a fake clock; `sleep` advances the clock. Counts granted slots (quota units) per domain. */
function harness(linkedInFetch: JobFetchLinkedInMode = "enabled") {
  let now = T0.getTime();
  const clock = () => new Date(now);
  const inner = new InMemoryFetchDomainGuard(clock, { linkedInFetch });
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
  const events: HopEvent[] = [];
  const hops = () =>
    new JobFetchHops(
      {
        guard,
        now: clock,
        sleep: (ms) => (slept.push(ms), (now += ms), Promise.resolve()),
        onEvent: (event) => events.push(event),
      },
      new AbortController().signal,
    );
  return { hops, guard, granted, tripped, slept, events, advance: (ms: number) => (now += ms) };
}

/** Runs `beforeHop` over a redirect chain as SafeHttpClient would; returns the URLs actually sent. */
async function chain(policy: JobFetchHops, urls: string[]): Promise<string[]> {
  const sent: string[] = [];
  for (const [hop, url] of urls.entries()) {
    const replaced = await policy.beforeHop(new URL(url), hop);
    sent.push((replaced ?? new URL(url)).href);
  }
  return sent;
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error("expected a rejection");
    },
    (error: unknown) => error,
  );
}

const JOB = "https://www.linkedin.com/jobs/view/4012345678";

describe("LinkedIn path validation", () => {
  it.each([
    ["https://www.linkedin.com/jobs/view/4012345678", JOB],
    ["https://br.linkedin.com/jobs/view/4012345678/?trk=public_jobs&refId=x#top", JOB],
    ["http://linkedin.com/jobs/view/4012345678", JOB],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeLinkedInUrl(new URL(input))?.href).toBe(expected);
  });

  it.each([
    "https://www.linkedin.com/in/fulano",
    "https://www.linkedin.com/jobs/search/?keywords=data",
    "https://www.linkedin.com/jobs/collections/recommended",
    "https://www.linkedin.com/company/acme/jobs",
    "https://www.linkedin.com/feed/",
    "https://www.linkedin.com/jobs/view/senior-engineer-4012345678",
  ])("rejects %s", (input) => {
    expect(normalizeLinkedInUrl(new URL(input))).toBeNull();
  });

  it("recognizes login paths", () => {
    for (const path of ["/login", "/authwall", "/checkpoint/challenge", "/uas/login", "/LOGIN"]) {
      expect(isLoginPath(path)).toBe(true);
    }
    for (const path of ["/jobs/view/1", "/loginhelp", "/careers/login-page"]) {
      expect(isLoginPath(path)).toBe(false);
    }
  });
});

describe("JobFetchHops: per-hop policy by destination domain", () => {
  it("sends the normalized LinkedIn URL", async () => {
    const h = harness();
    expect(await chain(h.hops(), [`${JOB}?trk=abc`])).toEqual([JOB]);
    expect(h.granted).toEqual(["linkedin.com"]);
  });

  it("lnkd.in → www.linkedin.com/jobs/view: waits once in the chain, no loop, 2 quota units", async () => {
    const h = harness();
    const sent = await chain(h.hops(), ["https://lnkd.in/abc123", JOB]);
    expect(sent).toEqual(["https://lnkd.in/abc123", JOB]);
    expect(h.slept).toEqual([15_000]);
    expect(h.granted).toEqual(["linkedin.com", "linkedin.com"]);
  });

  it("lnkd.in → linkedin.com/in/fulano is permanent and never sent", async () => {
    const h = harness();
    const error = await rejection(
      chain(h.hops(), ["https://lnkd.in/abc", "https://www.linkedin.com/in/fulano"]),
    );
    expect(error).toEqual(new JobFetchError("permanent"));
    expect(h.granted).toEqual(["linkedin.com"]);
  });

  it("third party → linkedin.com/authwall is blocked and opens the LinkedIn breaker", async () => {
    const h = harness();
    const error = await rejection(
      chain(h.hops(), ["https://jobs.acme.example/r/1", "https://www.linkedin.com/authwall?trk=x"]),
    );
    expect(error).toEqual(new JobFetchError("blocked"));
    expect(h.tripped).toEqual(["linkedin.com:login_redirect"]);
    // Queued fetches for LinkedIn now fail without touching the site.
    expect(await rejection(chain(h.hops(), [JOB]))).toEqual(new JobFetchError("blocked"));
    expect(h.granted).toEqual(["acme.example"]);
  });

  it("third party → LinkedIn applies the LinkedIn interval, not the third party's", async () => {
    const h = harness();
    await chain(h.hops(), [JOB]);
    h.advance(6_000); // past the 5 s of other domains, not the 15 s of LinkedIn
    await chain(h.hops(), ["https://acme.gupy.io/jobs/1", JOB]);
    expect(h.slept).toEqual([9_000]);
    expect(h.granted).toEqual(["linkedin.com", "gupy.io", "linkedin.com"]);
  });

  it("with the kill switch, a redirect to LinkedIn is not followed", async () => {
    const h = harness("disabled");
    const error = await rejection(chain(h.hops(), ["https://jobs.acme.example/r/1", JOB]));
    expect(error).toEqual(new JobFetchError("blocked"));
    expect(h.granted).toEqual(["acme.example"]);
    expect(await rejection(chain(h.hops(), ["https://lnkd.in/abc"]))).toEqual(
      new JobFetchError("blocked"),
    );
  });

  it("defers the job when the first hop must wait (reschedule, never sleep)", async () => {
    const h = harness();
    await chain(h.hops(), [JOB]);
    h.advance(4_000);
    const error = await rejection(chain(h.hops(), [JOB]));
    expect(error).toBeInstanceOf(JobFetchDeferredError);
    expect((error as JobFetchDeferredError).retryAt).toEqual(new Date(T0.getTime() + 15_000));
    expect(h.slept).toEqual([]);
  });

  it("defers the job when a redirect hop still has to wait after the one in-chain wait", async () => {
    const h = harness();
    let calls = 0;
    const contended: FetchDomainGuard = {
      // A concurrent fetch takes the slot while this one sleeps.
      acquire: (domain) =>
        (calls += 1) === 1
          ? h.guard.acquire(domain)
          : Promise.resolve({ outcome: "wait", retryAt: new Date(T0.getTime() + 10_000) }),
      tripBreaker: h.guard.tripBreaker,
    };
    const sleeps: number[] = [];
    const policy = new JobFetchHops(
      { guard: contended, now: () => T0, sleep: (ms) => (sleeps.push(ms), Promise.resolve()) },
      new AbortController().signal,
    );
    await policy.beforeHop(new URL("https://lnkd.in/a"), 0);
    calls = 1;
    const error = await rejection(policy.beforeHop(new URL(JOB), 1));
    expect(error).toBeInstanceOf(JobFetchDeferredError);
    expect(sleeps).toEqual([10_000]);
    expect(calls).toBe(3);
  });

  it("does not wait in the chain longer than the policy interval", async () => {
    const h = harness();
    const policy = new JobFetchHops(
      {
        guard: {
          acquire: () =>
            Promise.resolve({ outcome: "wait", retryAt: new Date(T0.getTime() + 16_000) }),
          tripBreaker: h.guard.tripBreaker,
        },
        now: () => T0,
        sleep: () => Promise.reject(new Error("must not sleep")),
      },
      new AbortController().signal,
    );
    expect(await rejection(policy.beforeHop(new URL(JOB), 1))).toBeInstanceOf(
      JobFetchDeferredError,
    );
  });

  it("fails blocked once the LinkedIn quota of 40/24 h is used", async () => {
    const h = harness();
    for (let i = 0; i < 40; i += 1) {
      await chain(h.hops(), [JOB]);
      h.advance(15_000);
    }
    expect(await rejection(chain(h.hops(), [JOB]))).toEqual(new JobFetchError("blocked"));
    expect(h.granted).toHaveLength(40);
  });
});

describe("classifyFetchFailure", () => {
  it.each([429, 999, 403])(
    "HTTP %i trips the breaker of the domain that answered",
    async (status) => {
      const h = harness();
      const policy = h.hops();
      await chain(policy, [
        "https://jobs.acme.example/r",
        "https://boards.greenhouse.io/acme/jobs/1",
      ]);
      const error = await rejection(
        classifyFetchFailure(new SafeHttpError("http_status", status), policy),
      );
      expect(error).toEqual(new JobFetchError("blocked"));
      expect(h.tripped).toEqual([`greenhouse.io:http_${status}`]);
      // The breaker holds for 24 h and the manual retry respects it.
      h.advance(23 * 60 * 60 * 1000);
      expect(
        await rejection(chain(h.hops(), ["https://boards.greenhouse.io/acme/jobs/2"])),
      ).toEqual(new JobFetchError("blocked"));
    },
  );

  it.each([
    [new SafeHttpError("http_status", 503), "transient"],
    [new SafeHttpError("http_status", 404), "permanent"],
    [new SafeHttpError("timeout"), "transient"],
    [new SafeHttpError("network"), "transient"],
    [new SafeHttpError("ssrf_blocked"), "permanent"],
    [new SafeHttpError("too_large"), "permanent"],
    [new SafeHttpError("not_html"), "permanent"],
    [new SafeHttpError("redirect_limit"), "permanent"],
    [new Error("boom"), "transient"],
  ] as const)("%s → %s", async (error, kind) => {
    const h = harness();
    const policy = h.hops();
    await chain(policy, ["https://jobs.acme.example/r"]);
    expect(await rejection(classifyFetchFailure(error, policy))).toEqual(new JobFetchError(kind));
    expect(h.tripped).toEqual([]);
  });
});
