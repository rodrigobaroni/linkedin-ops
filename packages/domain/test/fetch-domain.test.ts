import { describe, expect, it } from "vitest";
import {
  EMPTY_FETCH_DOMAIN_STATE,
  FETCH_BREAKER_OPEN_MS,
  FETCH_QUOTA_WINDOW_MS,
  InMemoryFetchDomainGuard,
  JOB_FETCH_PASTED_GROUP,
  decideFetchSlot,
  fetchDomainOfHost,
  fetchDomainPolicy,
  jobFetchGroupId,
  tripFetchBreaker,
  type FetchDomainState,
} from "../src/index.js";

const T0 = new Date("2026-10-22T12:00:00.000Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

describe("jobFetchGroupId", () => {
  it.each([
    ["https://www.linkedin.com/jobs/view/123", "linkedin.com"],
    ["https://br.linkedin.com/jobs/view/123", "linkedin.com"],
    ["https://linkedin.com/jobs/view/123", "linkedin.com"],
    ["https://lnkd.in/abcd", "linkedin.com"],
    ["https://acme.gupy.io/jobs/1", "gupy.io"],
    ["https://boards.greenhouse.io/acme/jobs/1", "greenhouse.io"],
    ["https://jobs.lever.co/acme/1", "lever.co"],
    ["https://acme.wd5.myworkdayjobs.com/x", "myworkdayjobs.com"],
    ["https://careers.acme.co.uk/1", "acme.co.uk"],
    ["https://acme.com.br/vagas", "acme.com.br"],
  ])("%s → %s", (url, group) => {
    expect(jobFetchGroupId(url)).toBe(group);
  });

  it("ignores the private section of the PSL (stricter: one bucket per ICANN domain)", () => {
    expect(jobFetchGroupId("https://a.github.io/job")).toBe("github.io");
    expect(jobFetchGroupId("https://b.github.io/job")).toBe("github.io");
  });

  it("normalizes case, trailing dot, port, credentials and IDN", () => {
    expect(jobFetchGroupId("HTTPS://WWW.LinkedIn.COM./jobs/view/1")).toBe("linkedin.com");
    expect(jobFetchGroupId("https://u:p@jobs.example.com:8443/x")).toBe("example.com");
    expect(jobFetchGroupId("https://jobs.münchen.de/")).toBe("xn--mnchen-3ya.de");
  });

  it("falls back to the host when there is no registrable domain", () => {
    expect(jobFetchGroupId("http://10.0.0.1/x")).toBe("10.0.0.1");
    expect(jobFetchGroupId("http://localhost:3000/")).toBe("localhost");
    expect(jobFetchGroupId("http://[::1]/")).toBe("[::1]");
  });

  it("throws on an invalid URL", () => {
    expect(() => jobFetchGroupId("not a url")).toThrow(TypeError);
  });

  it("is idempotent over its own output and never yields the pasted group", () => {
    for (const group of ["linkedin.com", "gupy.io", "acme.co.uk", "github.io", "10.0.0.1"]) {
      expect(fetchDomainOfHost(group)).toBe(group);
    }
    expect(JOB_FETCH_PASTED_GROUP).not.toContain(".");
  });
});

describe("fetchDomainPolicy", () => {
  it("applies the ADR-0008 §4 defaults", () => {
    expect(fetchDomainPolicy("linkedin.com")).toEqual({
      minIntervalMs: 15_000,
      maxPerRolling24h: 40,
    });
    expect(fetchDomainPolicy("gupy.io")).toEqual({ minIntervalMs: 5_000, maxPerRolling24h: null });
  });
});

describe("decideFetchSlot", () => {
  const granted = (domain: string, state: FetchDomainState, now: Date) => {
    const decision = decideFetchSlot(domain, state, now, "enabled");
    expect(decision.slot).toEqual({ outcome: "granted" });
    return decision.state as FetchDomainState;
  };

  it("grants a first request and records it", () => {
    const state = granted("linkedin.com", EMPTY_FETCH_DOMAIN_STATE, T0);
    expect(state.lastRequestAt).toEqual(T0);
    expect(state.recentRequests).toEqual([T0]);
  });

  it("keeps no quota window for domains without a quota", () => {
    expect(granted("gupy.io", EMPTY_FETCH_DOMAIN_STATE, T0).recentRequests).toEqual([]);
  });

  it("enforces the minimum interval exactly (15 s LinkedIn, 5 s others)", () => {
    const linkedin = granted("linkedin.com", EMPTY_FETCH_DOMAIN_STATE, T0);
    expect(decideFetchSlot("linkedin.com", linkedin, at(14_999), "enabled")).toEqual({
      slot: { outcome: "wait", retryAt: at(15_000) },
      state: null,
    });
    granted("linkedin.com", linkedin, at(15_000));

    const other = granted("gupy.io", EMPTY_FETCH_DOMAIN_STATE, T0);
    expect(decideFetchSlot("gupy.io", other, at(4_999), "enabled").slot).toEqual({
      outcome: "wait",
      retryAt: at(5_000),
    });
    granted("gupy.io", other, at(5_000));
  });

  it("waits when the last request is in the future (clock moved back)", () => {
    const state = { ...EMPTY_FETCH_DOMAIN_STATE, lastRequestAt: at(60_000) };
    expect(decideFetchSlot("gupy.io", state, T0, "enabled").slot).toEqual({
      outcome: "wait",
      retryAt: at(65_000),
    });
  });

  it("allows 40 LinkedIn requests per rolling 24 h; the 41st waits for the oldest to leave", () => {
    let state = EMPTY_FETCH_DOMAIN_STATE;
    for (let i = 0; i < 40; i += 1) state = granted("linkedin.com", state, at(i * 60_000));
    const now = at(40 * 60_000);
    expect(decideFetchSlot("linkedin.com", state, now, "enabled")).toEqual({
      slot: { outcome: "quota_exhausted", retryAt: at(FETCH_QUOTA_WINDOW_MS) },
      state: null,
    });
    // The oldest request leaves the window exactly 24 h after it was made.
    const next = granted("linkedin.com", state, at(FETCH_QUOTA_WINDOW_MS));
    expect(next.recentRequests).toHaveLength(40);
    expect(next.recentRequests[0]).toEqual(at(60_000));
  });

  it("checks the breaker before the quota and the interval, until it expires", () => {
    const state: FetchDomainState = {
      ...EMPTY_FETCH_DOMAIN_STATE,
      lastRequestAt: T0,
      breakerOpenUntil: at(FETCH_BREAKER_OPEN_MS),
      breakerSignal: "http_429",
      breakerOpenedAt: T0,
    };
    expect(decideFetchSlot("gupy.io", state, at(1_000), "enabled").slot).toEqual({
      outcome: "breaker_open",
      until: at(FETCH_BREAKER_OPEN_MS),
      signal: "http_429",
    });
    granted("gupy.io", state, at(FETCH_BREAKER_OPEN_MS));
  });

  it("checks the kill switch first, and only for linkedin.com", () => {
    const open = tripFetchBreaker(EMPTY_FETCH_DOMAIN_STATE, "http_999", T0);
    expect(decideFetchSlot("linkedin.com", open, T0, "disabled")).toEqual({
      slot: { outcome: "disabled" },
      state: null,
    });
    granted("gupy.io", EMPTY_FETCH_DOMAIN_STATE, T0);
    expect(decideFetchSlot("gupy.io", EMPTY_FETCH_DOMAIN_STATE, T0, "disabled").slot).toEqual({
      outcome: "granted",
    });
  });
});

describe("tripFetchBreaker", () => {
  it("opens for 24 h from now and keeps an already later end with its signal", () => {
    const first = tripFetchBreaker(EMPTY_FETCH_DOMAIN_STATE, "http_429", T0);
    expect(first).toMatchObject({
      breakerOpenUntil: at(FETCH_BREAKER_OPEN_MS),
      breakerSignal: "http_429",
      breakerOpenedAt: T0,
    });
    const later = tripFetchBreaker(first, "login_wall", at(60_000));
    expect(later).toMatchObject({
      breakerOpenUntil: at(60_000 + FETCH_BREAKER_OPEN_MS),
      breakerSignal: "login_wall",
    });
    expect(tripFetchBreaker(later, "http_403", T0)).toBe(later);
  });
});

describe("InMemoryFetchDomainGuard", () => {
  it("normalizes hosts, so a redirect via lnkd.in shares linkedin.com's state", async () => {
    let now = T0;
    const guard = new InMemoryFetchDomainGuard(() => now, { linkedInFetch: "enabled" });
    expect(await guard.acquire(jobFetchGroupId("https://lnkd.in/abc"))).toEqual({
      outcome: "granted",
    });
    now = at(1_000);
    expect(await guard.acquire("www.linkedin.com")).toEqual({
      outcome: "wait",
      retryAt: at(15_000),
    });
    expect(await guard.tripBreaker("linkedin.com", "login_redirect")).toEqual({
      openUntil: at(1_000 + FETCH_BREAKER_OPEN_MS),
    });
    now = at(20_000);
    expect(await guard.acquire("lnkd.in")).toMatchObject({ outcome: "breaker_open" });
    expect(await guard.acquire("gupy.io")).toEqual({ outcome: "granted" });
  });

  it("returns disabled for every LinkedIn host when the kill switch is off", async () => {
    const guard = new InMemoryFetchDomainGuard(() => T0, { linkedInFetch: "disabled" });
    for (const host of ["lnkd.in", "www.linkedin.com", "linkedin.com"]) {
      expect(await guard.acquire(host)).toEqual({ outcome: "disabled" });
    }
  });
});
