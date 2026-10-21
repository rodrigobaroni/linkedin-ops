/**
 * T-061 — manual proof of the LinkedIn official API with the real app (G-01). Run on the operator's machine:
 *
 *   pnpm --filter @linkedin-ops/api linkedin:probe [--pkce] [--api-version YYYYMM] [--publish-file /abs/path.txt]
 *
 * Flow: authorization code (state CSPRNG, optional PKCE S256) → token exchange → GET /v2/userinfo →
 * `LinkedIn-Version` check (non-mutating) → optionally ONE `POST /rest/posts` with a text file the owner
 * approved, after typing PUBLICAR on the terminal. The access token lives only in memory and is never
 * printed; LinkedIn error bodies are reduced to `code`/`message`. Output feeds docs/security/linkedin-api-proof.md.
 */
import { execFile } from "node:child_process";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import {
  LINKEDIN_API_VERSION,
  LINKEDIN_AUTHORIZE_URL,
  LINKEDIN_COMMENTARY_MAX_LENGTH,
  LINKEDIN_POSTS_URL,
  LINKEDIN_RESTLI_PROTOCOL_VERSION,
  LINKEDIN_SCOPES,
  LINKEDIN_TOKEN_URL,
  LINKEDIN_USERINFO_URL,
  linkedinPostUrl,
} from "../src/linkedin/linkedin.constants.js";
import { escapeLittleText } from "../src/linkedin/little-text.js";

const HTTP_TIMEOUT_MS = 15_000;
const CALLBACK_TIMEOUT_MS = 5 * 60_000;
/** Response headers worth recording (rate limits, tracing ids, version echo); everything else is skipped. */
const INTERESTING_HEADER =
  /^(x-li-|x-restli-|x-ratelimit|ratelimit|retry-after$|linkedin-version$)/i;

const out = (line = ""): void => {
  process.stdout.write(`${line}\n`);
};

/** External strings are untrusted: strip control characters (terminal injection) and bound the length. */
function printable(value: unknown, max = 300): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  // eslint-disable-next-line no-control-regex
  return (text ?? "").replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, "?").slice(0, max);
}

function fail(message: string): never {
  process.stderr.write(`\n✗ ${message}\n`);
  process.exit(1);
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name} ausente no .env da raiz do worktree`);
  return value;
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function interestingHeaders(headers: Headers): Record<string, string> {
  const picked: Record<string, string> = {};
  headers.forEach((value, name) => {
    if (INTERESTING_HEADER.test(name)) picked[name] = printable(value, 120);
  });
  return picked;
}

/** Reduces a LinkedIn error body to its documented fields; never echoes the request. */
async function errorSummary(response: Response): Promise<string> {
  const raw = await response.text().catch(() => "");
  try {
    const body = JSON.parse(raw) as Record<string, unknown>;
    const code = body.code ?? body.serviceErrorCode ?? body.error;
    const message = body.message ?? body.error_description;
    return `HTTP ${response.status} code=${printable(code, 80)} message=${printable(message, 300)}`;
  } catch {
    return `HTTP ${response.status} (corpo não-JSON, ${raw.length} bytes)`;
  }
}

/** Waits for exactly one request on the loopback redirect path, then closes the listener. */
function awaitCallback(redirect: URL): Promise<URLSearchParams> {
  return new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", redirect.origin);
      if (request.method !== "GET" || url.pathname !== redirect.pathname) {
        response.writeHead(404).end();
        return;
      }
      response
        .writeHead(200, {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
        })
        .end("Probe LinkedIn Ops: callback recebido. Pode fechar esta aba e voltar ao terminal.");
      clearTimeout(timer);
      server.close();
      resolve(url.searchParams);
    });
    const timer = setTimeout(() => {
      server.close();
      reject(new Error("tempo esgotado (5 min) esperando o callback"));
    }, CALLBACK_TIMEOUT_MS);
    server.on("error", reject);
    server.listen(Number(redirect.port || 80), redirect.hostname);
  });
}

async function confirmOnTty(question: string, expected: string): Promise<boolean> {
  if (!process.stdin.isTTY) fail("confirmação exige terminal interativo (TTY)");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim() === expected;
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const { values } = parseArgs({
    args: argv[0] === "--" ? argv.slice(1) : argv,
    options: {
      pkce: { type: "boolean", default: false },
      "api-version": { type: "string", default: LINKEDIN_API_VERSION },
      "publish-file": { type: "string" },
    },
    strict: true,
  });
  const apiVersion = values["api-version"];
  if (!/^\d{6}$/.test(apiVersion)) fail("--api-version deve ser YYYYMM");

  const clientId = requireEnv("LINKEDIN_CLIENT_ID");
  const clientSecret = requireEnv("LINKEDIN_CLIENT_SECRET");
  const redirectUri = requireEnv("LINKEDIN_REDIRECT_URI");
  const redirect = new URL(redirectUri);
  if (redirect.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(redirect.hostname)) {
    fail("o probe só roda com LINKEDIN_REDIRECT_URI de loopback (http://localhost:<porta>/…)");
  }

  // Read and validate the post text up front so a bad file fails before the OAuth round-trip.
  let postText: string | undefined;
  if (values["publish-file"]) {
    postText = (await readFile(values["publish-file"], "utf8")).replace(/\s+$/u, "");
    if (postText.length === 0 || postText.length > LINKEDIN_COMMENTARY_MAX_LENGTH) {
      fail(
        `texto deve ter 1..${LINKEDIN_COMMENTARY_MAX_LENGTH} caracteres (tem ${postText.length})`,
      );
    }
  }

  const state = randomBytes(32).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  const codeVerifier = values.pkce ? randomBytes(48).toString("base64url") : undefined;

  const authorize = new URL(LINKEDIN_AUTHORIZE_URL);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("scope", LINKEDIN_SCOPES.join(" "));
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("nonce", nonce);
  if (codeVerifier) {
    authorize.searchParams.set("code_challenge", sha256(codeVerifier).toString("base64url"));
    authorize.searchParams.set("code_challenge_method", "S256");
  }

  out("== LinkedIn Ops — probe T-061 ==");
  out(`escopos pedidos: ${LINKEDIN_SCOPES.join(" ")}`);
  out(`PKCE: ${codeVerifier ? "S256 (teste)" : "desligado"}`);
  out(`LinkedIn-Version: ${apiVersion}`);
  out(`redirect: ${redirectUri}`);
  out();
  out("Abra esta URL no navegador e autorize o app (abrindo automaticamente no macOS):");
  out(authorize.toString());
  const callback = awaitCallback(redirect);
  if (process.platform === "darwin") execFile("open", [authorize.toString()], () => undefined);

  const params = await callback;
  const returnedState = params.get("state") ?? "";
  // Compare digests: constant time and independent of the attacker-controlled length.
  if (!timingSafeEqual(sha256(returnedState), sha256(state)))
    fail("state divergente — callback descartado");
  const error = params.get("error");
  if (error) {
    fail(
      `autorização negada: error=${printable(error, 80)} description=${printable(params.get("error_description"))}`,
    );
  }
  const code = params.get("code");
  if (!code) fail("callback sem code nem error");
  out("✓ callback com state válido");

  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });
  if (codeVerifier) form.set("code_verifier", codeVerifier);
  const tokenResponse = await fetch(LINKEDIN_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: form,
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (!tokenResponse.ok) fail(`troca do code falhou: ${await errorSummary(tokenResponse)}`);
  const token = (await tokenResponse.json()) as {
    access_token?: string;
    expires_in?: number;
    scope?: string;
    refresh_token?: string;
    refresh_token_expires_in?: number;
    id_token?: string;
  };
  if (!token.access_token) fail("resposta do token sem access_token");
  const accessToken = token.access_token;
  const grantedScopes = (token.scope ?? "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .sort();
  out("✓ token obtido (não exibido)");
  out(`  escopos concedidos: ${printable(grantedScopes.join(" ")) || "(campo scope ausente)"}`);
  out(
    `  expires_in: ${token.expires_in ?? "?"} s (~${Math.round((token.expires_in ?? 0) / 86_400)} dias)`,
  );
  out(
    `  refresh_token: ${token.refresh_token ? `sim (expira em ${token.refresh_token_expires_in ?? "?"} s)` : "não"}`,
  );
  out(`  id_token: ${token.id_token ? "sim" : "não"}`);
  if (token.id_token) {
    // Diagnostic only: signature is NOT verified here; the API flow relies on /v2/userinfo instead.
    const payload = JSON.parse(
      Buffer.from(token.id_token.split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as {
      nonce?: string;
    };
    out(
      `  id_token.nonce confere: ${payload.nonce === nonce ? "sim" : "não"} (assinatura não verificada)`,
    );
  }
  const missing = LINKEDIN_SCOPES.filter((scope) => !grantedScopes.includes(scope));
  if (missing.length > 0) out(`  ⚠ escopos pedidos e não concedidos: ${missing.join(" ")}`);

  const userinfoResponse = await fetch(LINKEDIN_USERINFO_URL, {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (!userinfoResponse.ok)
    fail(`GET /v2/userinfo falhou: ${await errorSummary(userinfoResponse)}`);
  const userinfo = (await userinfoResponse.json()) as { sub?: string; name?: string };
  if (!userinfo.sub) fail("userinfo sem sub");
  const authorUrn = `urn:li:person:${userinfo.sub}`;
  out("✓ GET /v2/userinfo");
  out(`  sub: ${printable(userinfo.sub, 64)}  name: ${printable(userinfo.name, 120)}`);
  out(`  campos retornados: ${Object.keys(userinfo).sort().join(", ")}`);
  out(`  headers: ${JSON.stringify(interestingHeaders(userinfoResponse.headers))}`);

  // Non-mutating version check: a read of a non-existent post. 426 = version not supported; any other
  // status (403 without r_member_social, 404) proves the version header itself was accepted.
  const versionResponse = await fetch(
    `${LINKEDIN_POSTS_URL}/${encodeURIComponent("urn:li:share:0")}`,
    {
      headers: {
        authorization: `Bearer ${accessToken}`,
        "linkedin-version": apiVersion,
        "x-restli-protocol-version": LINKEDIN_RESTLI_PROTOCOL_VERSION,
      },
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    },
  );
  const versionDetail = await errorSummary(versionResponse);
  out(`✓ checagem de versão (GET /rest/posts/urn:li:share:0): ${versionDetail}`);
  out(`  headers: ${JSON.stringify(interestingHeaders(versionResponse.headers))}`);
  if (versionResponse.status === 426)
    fail(`LinkedIn-Version ${apiVersion} não suportada; rode com --api-version`);

  if (postText !== undefined) {
    out();
    out("== Publicação de teste (POST /rest/posts) ==");
    out(`conta: ${printable(userinfo.name, 120)} (${authorUrn})`);
    out(`visibilidade: PUBLIC · ${postText.length} caracteres · texto exato abaixo`);
    out("-----");
    out(printable(postText, LINKEDIN_COMMENTARY_MAX_LENGTH));
    out("-----");
    if (
      !(await confirmOnTty("Digite PUBLICAR para publicar este texto nesta conta: ", "PUBLICAR"))
    ) {
      fail("publicação cancelada pelo operador (nada foi enviado)");
    }
    try {
      const postResponse = await fetch(LINKEDIN_POSTS_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
          "linkedin-version": apiVersion,
          "x-restli-protocol-version": LINKEDIN_RESTLI_PROTOCOL_VERSION,
        },
        body: JSON.stringify({
          author: authorUrn,
          commentary: escapeLittleText(postText),
          visibility: "PUBLIC",
          distribution: {
            feedDistribution: "MAIN_FEED",
            targetEntities: [],
            thirdPartyDistributionChannels: [],
          },
          lifecycleState: "PUBLISHED",
          isReshareDisabledByAuthor: false,
        }),
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });
      if (postResponse.status !== 201)
        fail(`POST /rest/posts falhou: ${await errorSummary(postResponse)}`);
      const postUrn = postResponse.headers.get("x-restli-id") ?? "";
      out(`✓ publicado: HTTP 201 x-restli-id=${printable(postUrn, 120)}`);
      if (postUrn) out(`  url: ${linkedinPostUrl(printable(postUrn, 120))}`);
      out(`  headers: ${JSON.stringify(interestingHeaders(postResponse.headers))}`);
    } catch (error) {
      // Timeout/network after sending: outcome unknown (ADR-0003 AMBIGUOUS). Never retry automatically.
      fail(
        `resultado AMBÍGUO (${printable((error as Error).name)}): verifique o perfil no LinkedIn antes de qualquer nova tentativa`,
      );
    }
  }

  out();
  out("Fim. O token existiu só em memória neste processo e foi descartado.");
}

main().catch((error: unknown) => fail(printable((error as Error).message ?? error)));
