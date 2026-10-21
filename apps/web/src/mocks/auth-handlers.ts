import {
  API_V1_BASE_PATH,
  CSRF_TOKEN_HEADER,
  ERROR_CODE_HTTP_STATUS,
  type ErrorCode,
  LoginInputSchema,
  type Me,
  PROBLEM_CONTENT_TYPE,
  type ProblemDetails,
  REQUESTED_WITH_HEADER,
  ReauthInputSchema,
  problemTypeFor,
  routesV1,
} from "@linkedin-ops/contracts";
import { HttpResponse, http } from "msw";

/**
 * Mock of the `auth.*` contract (ADR-0007, contracts.md §2.2) shared by the browser worker (`pnpm dev:mock`)
 * and the Vitest server. It mirrors the server rules the web must cope with — generic credential errors,
 * 5 failures/min → 15 min lock with `Retry-After`, N4 mutation headers, N2 token rotation — without
 * any Prisma/Argon2 logic. Everything is in memory; `resetMockAuth()` restores the initial state.
 */
export const MOCK_CREDENTIALS = {
  email: "rodrigo@example.com",
  // Example value for the mock only: not a secret, not used anywhere real.
  password: "linkedin-ops-dev-password",
} as const;

export const MOCK_USER: Omit<Me, "csrfToken" | "elevatedUntil"> = {
  id: "0199a3f2-0000-7000-8000-000000000001",
  email: MOCK_CREDENTIALS.email,
  name: "Rodrigo",
  role: "OWNER",
  locale: "pt-BR",
  timezone: "America/Sao_Paulo",
  linkedinConnected: true,
};

/** Dev-only cookie name: `__Host-` needs HTTPS, which `next dev` does not have. HttpOnly is emulated. */
export const MOCK_SESSION_COOKIE = "mock-session";
export const MOCK_RATE_LIMIT = { maxFailures: 5, windowMs: 60_000, lockMs: 15 * 60_000 } as const;
export const MOCK_ELEVATION_MS = 15 * 60_000;

type MockAuthState = {
  /** `null` = unknown (browser reload): the cookie decides; tests always set it explicitly. */
  loggedIn: boolean | null;
  csrfToken: string;
  elevatedUntil: number | null;
  failures: number[];
  lockedUntil: number | null;
};

const state: MockAuthState = initialState();

/** `linkedinConnected` of `/auth/me`; the publishing mock plugs in its connection state. */
let linkedInConnected: () => boolean = () => MOCK_USER.linkedinConnected;

export function provideMockLinkedInConnected(source: () => boolean): void {
  linkedInConnected = source;
}

function initialState(): MockAuthState {
  return {
    loggedIn: null,
    csrfToken: newToken(),
    elevatedUntil: null,
    failures: [],
    lockedUntil: null,
  };
}

export function resetMockAuth(overrides: Partial<MockAuthState> = {}): void {
  Object.assign(state, initialState(), { loggedIn: false }, overrides);
}

/** Read-only view for tests (e.g. to assert the token the page must send). */
export function mockAuthState(): Readonly<MockAuthState> {
  return state;
}

export function newToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return `mock-${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

const TITLES: Partial<Record<ErrorCode, string>> = {
  AUTH_REQUIRED: "Sessão necessária",
  AUTH_INVALID_CREDENTIALS: "E-mail ou senha inválidos",
  AUTH_REAUTH_REQUIRED: "Confirmação de senha necessária",
  CSRF_REJECTED: "Requisição rejeitada",
  RATE_LIMITED: "Muitas tentativas",
  VALIDATION_FAILED: "Dados inválidos",
};

export function problemResponse(
  code: ErrorCode,
  extra: { detail?: string; headers?: Record<string, string> } = {},
): HttpResponse<ProblemDetails> {
  const status = ERROR_CODE_HTTP_STATUS[code];
  const body: ProblemDetails = {
    type: problemTypeFor(code),
    title: TITLES[code] ?? code,
    status,
    detail: extra.detail,
    code,
    correlationId: `mock-${Date.now().toString(36)}`,
  };
  return HttpResponse.json(body, {
    status,
    headers: { "Content-Type": PROBLEM_CONTENT_TYPE, ...extra.headers },
  });
}

function isAuthenticated(cookies: Record<string, string>): boolean {
  return state.loggedIn ?? cookies[MOCK_SESSION_COOKIE] === "1";
}

/** ADR-0007 N4: JSON body + custom header on every mutation (Origin is checked by the browser/API). */
function violatesMutationRules(request: Request): boolean {
  const contentType = request.headers.get("Content-Type") ?? "";
  return (
    !contentType.startsWith("application/json") ||
    request.headers.get(REQUESTED_WITH_HEADER.name) !== REQUESTED_WITH_HEADER.value
  );
}

function sessionCookie(value: "1" | ""): string {
  const expiry = value ? "" : "; Max-Age=0";
  return `${MOCK_SESSION_COOKIE}=${value}; Path=/; SameSite=Lax${expiry}`;
}

function url(path: string): string {
  return `${API_V1_BASE_PATH}${path}`;
}

const noStore = { "Cache-Control": "no-store" } as const;

export const authHandlers = [
  http.post(url(routesV1["auth.login"].path), async ({ request }) => {
    if (violatesMutationRules(request)) return problemResponse("CSRF_REJECTED");
    const now = Date.now();
    if (state.lockedUntil !== null && state.lockedUntil > now) {
      return problemResponse("RATE_LIMITED", {
        headers: { "Retry-After": String(Math.ceil((state.lockedUntil - now) / 1000)) },
      });
    }
    const parsed = LoginInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return problemResponse("VALIDATION_FAILED");
    const { email, password } = parsed.data;
    if (email !== MOCK_CREDENTIALS.email || password !== MOCK_CREDENTIALS.password) {
      state.failures = [...state.failures.filter((t) => now - t < MOCK_RATE_LIMIT.windowMs), now];
      if (state.failures.length >= MOCK_RATE_LIMIT.maxFailures) {
        state.lockedUntil = now + MOCK_RATE_LIMIT.lockMs;
        state.failures = [];
        return problemResponse("RATE_LIMITED", {
          headers: { "Retry-After": String(MOCK_RATE_LIMIT.lockMs / 1000) },
        });
      }
      return problemResponse("AUTH_INVALID_CREDENTIALS");
    }
    state.loggedIn = true;
    state.failures = [];
    state.lockedUntil = null;
    state.elevatedUntil = null;
    state.csrfToken = newToken();
    return HttpResponse.json(
      { csrfToken: state.csrfToken, elevatedUntil: null },
      {
        headers: {
          ...noStore,
          [CSRF_TOKEN_HEADER]: state.csrfToken,
          "Set-Cookie": sessionCookie("1"),
        },
      },
    );
  }),

  http.get(url(routesV1["auth.me"].path), ({ cookies }) => {
    if (!isAuthenticated(cookies)) return problemResponse("AUTH_REQUIRED");
    state.loggedIn = true;
    const elevated = state.elevatedUntil !== null && state.elevatedUntil > Date.now();
    const me: Me = {
      ...MOCK_USER,
      linkedinConnected: linkedInConnected(),
      csrfToken: state.csrfToken,
      elevatedUntil: elevated ? new Date(state.elevatedUntil!).toISOString() : null,
    };
    return HttpResponse.json(me, { headers: noStore });
  }),

  http.post(url(routesV1["auth.reauth"].path), async ({ request, cookies }) => {
    if (!isAuthenticated(cookies)) return problemResponse("AUTH_REQUIRED");
    if (violatesMutationRules(request)) return problemResponse("CSRF_REJECTED");
    const parsed = ReauthInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || parsed.data.password !== MOCK_CREDENTIALS.password) {
      return problemResponse("AUTH_INVALID_CREDENTIALS");
    }
    state.elevatedUntil = Date.now() + MOCK_ELEVATION_MS;
    state.csrfToken = newToken();
    return HttpResponse.json(
      { csrfToken: state.csrfToken, elevatedUntil: new Date(state.elevatedUntil).toISOString() },
      { headers: { ...noStore, [CSRF_TOKEN_HEADER]: state.csrfToken } },
    );
  }),

  http.post(url(routesV1["auth.logout"].path), ({ request, cookies }) => {
    if (!isAuthenticated(cookies)) return problemResponse("AUTH_REQUIRED");
    if (violatesMutationRules(request)) return problemResponse("CSRF_REJECTED");
    state.loggedIn = false;
    state.elevatedUntil = null;
    state.csrfToken = newToken();
    return new HttpResponse(null, { status: 204, headers: { "Set-Cookie": sessionCookie("") } });
  }),
];

/** Guard for session-only handlers: `null` when the request may proceed. */
export function requireSession(
  cookies: Record<string, string>,
): HttpResponse<ProblemDetails> | null {
  return isAuthenticated(cookies) ? null : problemResponse("AUTH_REQUIRED");
}

/**
 * Guard for 🔐 handlers added later (publish now, autonomy change…): elevated session + `X-CSRF-Token`
 * bound to the session (ADR-0007 item 3). Returns `null` when the request may proceed.
 */
export function requireElevated(
  request: Request,
  cookies: Record<string, string>,
): HttpResponse<ProblemDetails> | null {
  if (!isAuthenticated(cookies)) return problemResponse("AUTH_REQUIRED");
  if (violatesMutationRules(request)) return problemResponse("CSRF_REJECTED");
  if (request.headers.get(CSRF_TOKEN_HEADER) !== state.csrfToken) {
    return problemResponse("CSRF_REJECTED");
  }
  if (state.elevatedUntil === null || state.elevatedUntil <= Date.now()) {
    return problemResponse("AUTH_REAUTH_REQUIRED");
  }
  return null;
}
