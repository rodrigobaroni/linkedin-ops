import {
  API_V1_BASE_PATH,
  IDEMPOTENCY_KEY_HEADER,
  IdempotencyKeySchema,
  type LinkedInIntegrationStatus,
  type PublicationStatus,
} from "@linkedin-ops/contracts";
import { HttpResponse, http } from "msw";
import type { LinkedInConnection } from "@/lib/api/linkedin";
import { PublishNowInputSchema, type PublicationView } from "@/lib/api/publications";
import { problemResponse, requireElevated, requireSession } from "./auth-handlers";

/**
 * Mock of the MVP-0 "Publicar" endpoints (contract of feat/T-061 a8821b1), in the shape of `lib/api/linkedin.ts` and
 * `lib/api/publications.ts` (until Pêndulo's contracts land). Mirrors the server rules the page relies on:
 * 🔐 on connect/disconnect/publish, `412 LINKEDIN_REAUTH_REQUIRED` without an active connection, and
 * idempotency (same key + same text → same publication, LinkedIn called once; same key + other text →
 * `409 IDEMPOTENCY_KEY_CONFLICT`). `resetMockPublishing()` restores the initial state.
 */
export const MOCK_MEMBER_NAME = "Rodrigo Baroni";
export const MOCK_MEMBER_URN = "urn:li:person:mock123";
/** Where `connect` points to. Outside tests the browser really leaves the app (see apps/web/README.md). */
export const MOCK_AUTHORIZE_URL =
  "https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=mock&state=mock";

type Outcome = Extract<PublicationStatus, "SUCCEEDED" | "FAILED" | "AMBIGUOUS"> | "LINKEDIN_401";

type MockPublishingState = {
  status: LinkedInIntegrationStatus;
  accessExpiresAt: string | null;
  /** Identity returned while connected (tests can null them to exercise the unidentified account). */
  memberName: string | null;
  memberUrn: string | null;
  /** Result of the next LinkedIn call made by publish-now (tests); `SUCCEEDED` by default. */
  nextOutcome: Outcome;
  /** How many times the mock "called LinkedIn" (an idempotent replay does not count). */
  linkedinCalls: number;
  publications: PublicationView[];
  byKey: Map<string, { text: string; publication: PublicationView }>;
};

const DAY_MS = 24 * 60 * 60_000;
const state: MockPublishingState = initialState();

function initialState(): MockPublishingState {
  return {
    status: "ACTIVE",
    accessExpiresAt: new Date(Date.now() + 55 * DAY_MS).toISOString(),
    memberName: MOCK_MEMBER_NAME,
    memberUrn: MOCK_MEMBER_URN,
    nextOutcome: "SUCCEEDED",
    linkedinCalls: 0,
    publications: [],
    byKey: new Map(),
  };
}

export function resetMockPublishing(overrides: Partial<MockPublishingState> = {}): void {
  Object.assign(state, initialState(), overrides);
}

export function mockPublishingState(): Readonly<MockPublishingState> {
  return state;
}

function connection(): LinkedInConnection {
  const active = state.status !== "DISCONNECTED";
  return {
    status: state.status,
    scopes: active ? ["openid", "profile", "w_member_social"] : [],
    accessExpiresAt: active ? state.accessExpiresAt : null,
    memberUrn: active ? state.memberUrn : null,
    memberName: active ? state.memberName : null,
  };
}

function url(path: string): string {
  return `${API_V1_BASE_PATH}${path}`;
}

function publish(text: string): PublicationView {
  state.linkedinCalls += 1;
  const outcome = state.nextOutcome;
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const succeeded = outcome === "SUCCEEDED";
  const postUrn = `urn:li:share:${7_000_000_000 + state.linkedinCalls}`;
  if (outcome === "LINKEDIN_401") state.status = "REAUTH_REQUIRED";
  return {
    id,
    draftId: null,
    draftVersionId: null,
    scheduleId: null,
    status: outcome === "LINKEDIN_401" ? "FAILED" : outcome,
    attempt: 1,
    externalPostId: succeeded ? postUrn : null,
    externalUrl: null,
    startedAt: now,
    finishedAt: now,
    publishedAt: succeeded ? now : null,
    error:
      outcome === "FAILED"
        ? { code: "LINKEDIN_BAD_REQUEST", httpStatus: 422, message: "Rejected by LinkedIn" }
        : outcome === "LINKEDIN_401"
          ? { code: "LINKEDIN_UNAUTHORIZED", httpStatus: 401, message: "Token rejected" }
          : null,
    createdAt: now,
    text,
  };
}

export const publishingHandlers = [
  http.get(url("/integrations/linkedin"), ({ cookies }) => {
    return requireSession(cookies) ?? HttpResponse.json(connection());
  }),

  http.post(url("/integrations/linkedin/connect"), ({ request, cookies }) => {
    const rejection = requireElevated(request, cookies);
    if (rejection) return rejection;
    // The real flow finishes in the OAuth callback; the mock connects right away.
    state.status = "ACTIVE";
    state.accessExpiresAt = new Date(Date.now() + 60 * DAY_MS).toISOString();
    return HttpResponse.json({ authorizeUrl: MOCK_AUTHORIZE_URL });
  }),

  http.delete(url("/integrations/linkedin"), ({ request, cookies }) => {
    const rejection = requireElevated(request, cookies);
    if (rejection) return rejection;
    state.status = "DISCONNECTED";
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(url("/publications"), ({ cookies }) => {
    return (
      requireSession(cookies) ??
      HttpResponse.json({ items: state.publications.slice(0, 10), nextCursor: null })
    );
  }),

  http.post(url("/publications/publish-now"), async ({ request, cookies }) => {
    const rejection = requireElevated(request, cookies);
    if (rejection) return rejection;
    const parsed = PublishNowInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return problemResponse("VALIDATION_FAILED");
    const { text } = parsed.data;
    const idempotencyKey = request.headers.get(IDEMPOTENCY_KEY_HEADER);
    if (!idempotencyKey || !IdempotencyKeySchema.safeParse(idempotencyKey).success) {
      return problemResponse("IDEMPOTENCY_KEY_REQUIRED");
    }
    const previous = state.byKey.get(idempotencyKey);
    if (previous) {
      if (previous.text !== text) return problemResponse("IDEMPOTENCY_KEY_CONFLICT");
      return HttpResponse.json(previous.publication, { status: 201 });
    }
    if (state.status !== "ACTIVE") return problemResponse("LINKEDIN_REAUTH_REQUIRED");
    const publication = publish(text);
    state.byKey.set(idempotencyKey, { text, publication });
    state.publications = [publication, ...state.publications];
    return HttpResponse.json(publication, { status: 201 });
  }),
];
