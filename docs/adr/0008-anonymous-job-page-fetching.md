# ADR-0008: Anonymous fetching of public job pages (Career module)

- Status: proposed
- Date: 2026-10-22
- Deciders: Rodrigo (product owner; risk acceptance, decisions D2 and D8 of
  `docs/superpowers/specs/2026-10-22-cv-tailoring-design.md`); Atlas (architect); review Sentinela (security);
  implementation Pêndulo (automation), Alicerce (backend)

## Context

The Career module (spec of 2026-10-22, parts B and C) tailors Rodrigo's CV to job postings. Rodrigo pastes 1 to
20 job links per batch; for each link the worker must obtain the posting text, extract its requirements and
produce a tailored CV plus a match report. Many of those links point to `https://www.linkedin.com/jobs/view/<id>`.

Until now the project forbade any access to the LinkedIn website outside the official APIs
(`docs/security/linkedin-policy.md` §2 principle 2 and §8): no scraping, no HTML extraction, no automation of the
site. There is no official API that lets a member-level app read an arbitrary job posting: the LinkedIn job APIs
are partner programs for posting jobs (ATS/job boards), not for reading them, and the app of this project only
has the self-service publishing product (`w_member_social`).

Rodrigo decided (D2) to lift the prohibition for this purpose and accepted the risk to his personal account and
to the publishing app; he chose (D8) approach A: the server fetches the page anonymously, never with his session,
and pasting the job text remains available as an alternative.

Facts this decision must not hide:

- The LinkedIn User Agreement prohibits automated access and scraping of the service, and `linkedin.com/robots.txt`
  does not authorize generic automated agents. Fetching job pages, even anonymously and at low volume, is not
  compliant with those terms. This ADR records an accepted deviation, not a compliant integration.
- The worker reaches LinkedIn from the same VM egress IP that the API adapter uses for publishing. A block of
  that IP by LinkedIn could, in the worst case, affect the publishing integration as well.
- Job pages are untrusted external content (prompt injection, malformed HTML, oversized responses) and the fetch
  takes a user-supplied URL, which is a classic SSRF vector (TM-08).

## Decision

1. **Narrow scope.** The exception covers exactly one operation: an HTTP `GET` of one public job posting URL that
   Rodrigo supplied in the Career module, to extract that posting's text. For `linkedin.com` the only accepted
   shape is `https://www.linkedin.com/jobs/view/<numeric id>` (normalized: `www` host, tracking query parameters
   and fragment removed); any other LinkedIn path (search, company, profile, feed, posts, `/jobs/search`,
   `/jobs/collections`) is rejected at validation with the paste-text alternative. No crawling, no link
   following beyond HTTP redirects, no pagination, no discovery of new URLs, no listing pages. Other domains
   accept any public job page URL under the same rules.

2. **Anonymous by construction.** The fetcher is a dedicated adapter in `apps/worker` with its own HTTP client:
   - it never sends cookies (no cookie jar; `Set-Cookie` is discarded), `Authorization`, or any LinkedIn OAuth
     token, client id or client secret, and has no access to the token vault (ADR-0004);
   - an architecture test fails if the fetch adapter imports the LinkedIn API adapter, the token vault or the
     session modules, and an integration test with canary credentials proves that no cookie, token or secret
     leaves in any request;
   - plain HTTP only: no headless browser, no JavaScript execution, no Selenium/Playwright, no browser extension.

3. **Honest identification, no evasion.** Requests carry a fixed, identifiable user agent
   (`LinkedInOpsJobFetcher/<version> (self-hosted; single user)`). The fetcher does not rotate user agents, does
   not impersonate a browser, does not use proxies or IP rotation, does not solve CAPTCHAs and does not retry
   around a refusal. When a site refuses, the fetch stops. `robots.txt` is not consulted, because each request
   is a single user-initiated fetch of a URL Rodrigo chose (like a link preview), not a crawler; this is part of
   the accepted deviation above and is stated as such in `linkedin-policy.md`.

4. **Rate limiting and immediate back-off** (defaults; Sentinela may tighten, never loosen, without a new review):
   - concurrency 1 per registrable domain; at least 15 s between requests to `linkedin.com` and 5 s to any other
     domain; at most 40 requests to `linkedin.com` per rolling 24 h;
   - **stop signals**: HTTP `429`, `999`, `403`, a redirect to `/login`, `/authwall`, `/checkpoint` or `/uas/`, or
     a page recognized as a login wall or CAPTCHA. On a stop signal the posting fails with reason `fetch_blocked`
     (UI offers paste-text), the URL is not retried automatically, and a per-domain circuit breaker opens for
     24 h: queued fetches for that domain fail fast to paste-text instead of hitting the site;
   - retries: only for network errors and `5xx` other than `999`, at most 1 retry after at least 60 s
     (`job.fetch` has `retryLimit = 1`); a manual "retry" by Rodrigo respects the circuit breaker;
   - kill switch: `JOB_FETCH_LINKEDIN=enabled|disabled` (validated by `validateRuntimeEnv`, default `enabled` per
     D2). With `disabled`, LinkedIn URLs go straight to paste-text. Operators disable it on any sign of account,
     IP or app restriction.

5. **SSRF protection** (shared `SafeHttpClient`, also used by RSS sources, closing part of TM-08):
   - schemes `http` and `https` only, ports 80 and 443 only, no credentials in the URL, no IP literals;
   - DNS resolved once per hop and the connection pinned to the validated address (no re-resolution between
     check and connect); private, loopback, link-local, CGNAT, multicast, unspecified, IPv4-mapped IPv6 and the
     Docker/VM networks are rejected, including the cloud metadata address;
   - every redirect is revalidated with the same rules; at most 3 redirects;
   - limits: 15 s total, 2 MB of decoded body (decompression counted), `text/html` or `text/plain` only;
   - failures are classified (`ssrf_blocked`, `too_large`, `timeout`, `not_html`) without echoing the response.

6. **Untrusted content and data minimization.** The page is reduced to the posting's main text before anything
   is stored; `raw_text` is truncated and kept only while the posting exists. Names of recruiters or other
   people on the page are not extracted into structured fields. The text enters prompts only as delimited data
   (`prompt-injection.md`, TM-09) and is covered by the T-058 adversarial corpus. Logs and audit events record
   domain, HTTP status class, outcome and duration, never the page content or the full URL query.

7. **Paste-text is a first-class path.** Every failure reason offers pasting the job text, which bypasses
   fetching entirely and is the expected path whenever LinkedIn refuses.

8. **Boundary of the exception.** This ADR does not authorize any other access to the LinkedIn website. Profile
   optimization (spec part A) or any feature reading profiles, feeds, posts, comments, companies or search pages
   needs its own ADR and Rodrigo's explicit decision. The prohibitions on automating the site, inauthentic
   engagement and using LinkedIn data for leads, CRM or enrichment stay unchanged.

## Alternatives considered

- **Official LinkedIn API.** Not available: job APIs are partner programs for posting jobs, and the
  member-level self-service product does not read job postings. Would be preferred if it existed.
- **Headless browser or extension using Rodrigo's logged-in session.** Rejected: it ties the activity to his
  account, conflicts with the Playwright/Selenium ban and with LinkedIn's prohibited-software rule, and would
  put session cookies on the server.
- **Paste-text only.** Safest and fully compliant; rejected by Rodrigo as the only path because of batch UX
  (5–20 links). Kept as the fallback for every failure.
- **Third-party job-data APIs or aggregators.** Possible future option; adds a paid dependency and a data
  processor, and most of them obtain the data by scraping as well, so they move the risk instead of removing it.

## Consequences

- `docs/security/linkedin-policy.md` and `docs/security/threat-model.md` are amended in the same PR as this ADR
  (principle 2 exception, new section for the Career module, new threats, gate G-07 and finding SEC-006).
- New components: `SafeHttpClient` and the job-page adapter in `apps/worker`, a per-domain limiter and circuit
  breaker persisted in PostgreSQL (state survives restarts), the `JOB_FETCH_LINKEDIN` kill switch.
- The same VM IP serves both fetching and publishing; a block on `www.linkedin.com` may affect the API
  integration. Monitoring of stop-signal rates per domain is required; repeated stop signals are an operational
  alert, not something to work around.
- Some LinkedIn job pages will not open anonymously (login wall); the product must present paste-text as normal,
  not as an error state.
- Rodrigo's risk acceptance is time-bound to this ADR: if LinkedIn restricts the account, the app or the IP, the
  kill switch is turned off and this ADR is revisited.

## Security / compliance impact

- **Compliance:** knowingly deviates from the LinkedIn User Agreement and robots.txt for one narrow, low-volume,
  user-initiated operation; risk to the personal account, the publishing app and the VM IP accepted by Rodrigo on
  2026-10-22 (SEC-006). No evasion of technical controls is ever implemented.
- **Confidentiality:** session cookies, OAuth tokens and app credentials are structurally unreachable from the
  fetcher (TM-27); CV and job text never reach logs, traces or Problem Details.
- **SSRF:** user-supplied URLs pass the shared `SafeHttpClient` controls (TM-08, TM-25).
- **Prompt injection:** job text is untrusted data, delimited and covered by adversarial tests (TM-09, TM-28).
- **Gate:** G-07 must pass before the fetcher runs in production.
