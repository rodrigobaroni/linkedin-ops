import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  LlmError,
  buildCvExtractRequest,
  buildCvTailorRequest,
  buildJobExtractRequest,
  resolveTargetLanguage,
  type LlmRequest,
} from "@linkedin-ops/editorial-engine";
import {
  OpenAiLlmClient,
  abortableSleep,
  parseRetryAfter,
  toOpenAiStrictSchema,
  type LlmCallEvent,
} from "../src/llm/openai.js";
import { baseCv, cvText, job, postingText } from "./fixtures.js";

// Fictional canary, assembled at run time so secret scanners do not see a key-shaped literal.
const API_KEY = ["sk", "test", "canary", "0123456789abcdef"].join("-");
const SECRET_INPUT = "CANARY-CV-CONTENT Ana Exemplo";

const request: LlmRequest = {
  promptId: "cv-extract",
  promptVersion: "1.0.0",
  model: "gpt-test",
  instructions: "SYSTEM TEXT",
  input: SECRET_INPUT,
  outputSchema: { name: "CvExtraction", strict: true, schema: { type: "object" } },
  maxOutputTokens: 100,
};

type Reply = (req: IncomingMessage, res: ServerResponse, body: string) => void;

let server: Server | null = null;

async function serve(
  replies: Reply[],
): Promise<{ url: string; bodies: string[]; headers: IncomingMessage["headers"][] }> {
  const bodies: string[] = [];
  const headers: IncomingMessage["headers"][] = [];
  let call = 0;
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk.toString()));
    req.on("end", () => {
      bodies.push(body);
      headers.push(req.headers);
      const reply = replies[Math.min(call, replies.length - 1)];
      call += 1;
      reply?.(req, res, body);
    });
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, bodies, headers };
}

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = null;
});

const json =
  (status: number, body: unknown, extra: Record<string, string> = {}): Reply =>
  (_q, res) => {
    res.writeHead(status, { "content-type": "application/json", ...extra });
    res.end(JSON.stringify(body));
  };

const completed = (output: unknown) =>
  json(200, {
    status: "completed",
    model: "gpt-test-2026",
    output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(output) }] }],
    usage: { input_tokens: 10, output_tokens: 5 },
  });

function client(url: string, events: LlmCallEvent[] = [], extra = {}) {
  return new OpenAiLlmClient({
    apiKey: API_KEY,
    baseUrl: url,
    sleep: () => Promise.resolve(),
    onEvent: (event) => events.push(event),
    ...extra,
  });
}

describe("OpenAiLlmClient (Responses API, Structured Outputs)", () => {
  it("sends a strict json_schema request with store:false and parses the output", async () => {
    const { url, bodies, headers } = await serve([completed({ ok: true })]);
    const response = await client(url).complete(request);
    expect(response).toEqual({
      output: { ok: true },
      model: "gpt-test-2026",
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    const sent = JSON.parse(bodies[0] ?? "{}") as Record<string, unknown>;
    expect(sent).toMatchObject({
      model: "gpt-test",
      instructions: "SYSTEM TEXT",
      input: SECRET_INPUT,
      store: false,
      max_output_tokens: 100,
      text: { format: { type: "json_schema", name: "CvExtraction", strict: true } },
    });
    expect(headers[0]?.authorization).toBe(`Bearer ${API_KEY}`);
  });

  it("retries 429 honouring Retry-After, then succeeds", async () => {
    const delays: number[] = [];
    const { url } = await serve([
      json(429, { error: {} }, { "retry-after": "2" }),
      completed({ ok: 1 }),
    ]);
    const llm = client(url, [], { sleep: (ms: number) => (delays.push(ms), Promise.resolve()) });
    await expect(llm.complete(request)).resolves.toMatchObject({ output: { ok: 1 } });
    expect(delays).toEqual([2000]);
  });

  it("gives up after maxRetries on 5xx", async () => {
    const events: LlmCallEvent[] = [];
    const { url, bodies } = await serve([json(503, {})]);
    await expect(client(url, events, { maxRetries: 2 }).complete(request)).rejects.toMatchObject({
      kind: "UNAVAILABLE",
      status: 503,
    });
    expect(bodies).toHaveLength(3);
    expect(events.map((e) => e.attempt)).toEqual([1, 2, 3]);
  });

  it("retries a transient error once by default", async () => {
    const { url, bodies } = await serve([json(503, {})]);
    await expect(client(url).complete(request)).rejects.toMatchObject({ kind: "UNAVAILABLE" });
    expect(bodies).toHaveLength(2);
  });

  it("an abort during the backoff makes no new request (Crivo PR89-3)", async () => {
    const controller = new AbortController();
    const { url, bodies } = await serve([json(503, {}), completed({ ok: true })]);
    const llm = client(url, [], {
      // The backoff is where the job gets cancelled (worker shutdown / expiry).
      sleep: (ms: number, signal?: AbortSignal) => {
        controller.abort();
        return abortableSleep(ms, signal);
      },
    });
    await expect(llm.complete(request, { signal: controller.signal })).rejects.toMatchObject({
      kind: "ABORTED",
      transient: false,
    });
    expect(bodies).toHaveLength(1);
  });

  it("an already-aborted signal makes no request at all", async () => {
    const controller = new AbortController();
    controller.abort();
    const { url, bodies } = await serve([completed({ ok: true })]);
    await expect(
      client(url).complete(request, { signal: controller.signal }),
    ).rejects.toMatchObject({
      kind: "ABORTED",
    });
    expect(bodies).toHaveLength(0);
  });

  it("aborting mid-request cancels it as ABORTED, not TIMEOUT", async () => {
    const controller = new AbortController();
    const { url } = await serve([() => undefined]);
    const pending = client(url, [], { timeoutMs: 10_000 }).complete(request, {
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 50);
    await expect(pending).rejects.toMatchObject({ kind: "ABORTED" });
  });

  it("does not retry auth or bad-request errors", async () => {
    const { url, bodies } = await serve([json(401, {})]);
    await expect(client(url).complete(request)).rejects.toMatchObject({
      kind: "AUTH",
      transient: false,
    });
    expect(bodies).toHaveLength(1);
  });

  it("treats an exhausted quota as permanent (no retries)", async () => {
    const { url, bodies } = await serve([
      json(429, {
        error: { type: "insufficient_quota", code: "credit_balance_exhausted", message: "x" },
      }),
    ]);
    await expect(client(url).complete(request)).rejects.toMatchObject({
      kind: "QUOTA_EXCEEDED",
      transient: false,
    });
    expect(bodies).toHaveLength(1);
  });

  it("maps refusal, incomplete and unparsable output", async () => {
    const refusal = json(200, {
      status: "completed",
      output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }],
    });
    const incomplete = json(200, { status: "incomplete", output: [] });
    const garbage = json(200, {
      status: "completed",
      output: [{ type: "message", content: [{ type: "output_text", text: "not json" }] }],
    });
    for (const [reply, kind] of [
      [refusal, "REFUSAL"],
      [incomplete, "INCOMPLETE"],
      [garbage, "INVALID_OUTPUT"],
    ] as const) {
      const { url } = await serve([reply]);
      await expect(client(url).complete(request)).rejects.toMatchObject({ kind });
      await new Promise<void>((resolve) => server?.close(() => resolve()));
      server = null;
    }
  });

  it("times out a hanging call and reports TIMEOUT", async () => {
    const { url } = await serve([() => undefined]);
    await expect(
      client(url, [], { timeoutMs: 50, maxRetries: 0 }).complete(request),
    ).rejects.toMatchObject({
      kind: "TIMEOUT",
    });
  });

  it("never exposes the key, instructions, input or output in events or errors", async () => {
    const events: LlmCallEvent[] = [];
    const { url } = await serve([
      json(500, { echo: SECRET_INPUT }),
      completed({ secret: SECRET_INPUT }),
    ]);
    await client(url, events).complete(request);
    const { url: url2 } = await (async () => {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
      server = null;
      return serve([json(400, { echo: SECRET_INPUT })]);
    })();
    const error = await client(url2, events)
      .complete(request)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LlmError);
    const dump = JSON.stringify(events) + String(error) + JSON.stringify(error);
    for (const secret of [API_KEY, SECRET_INPUT, "SYSTEM TEXT"]) expect(dump).not.toContain(secret);
  });
});

describe("abortableSleep", () => {
  it("resolves early when the signal aborts and immediately when already aborted", async () => {
    const controller = new AbortController();
    const started = Date.now();
    const sleeping = abortableSleep(60_000, controller.signal);
    controller.abort();
    await sleeping;
    await abortableSleep(60_000, controller.signal);
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});

describe("parseRetryAfter", () => {
  it("parses seconds and HTTP dates", () => {
    expect(parseRetryAfter("3")).toBe(3000);
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 4_000)).toBe(6000);
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("soon")).toBeNull();
  });
});

describe("OpenAI strict-mode dialect (adapter)", () => {
  it('never sends keywords next to $ref (OpenAI: "$ref cannot have keywords")', async () => {
    const options = { model: "gpt-test", rng: { hex: (n: number) => "e".repeat(n) } };
    const requests = [
      buildCvExtractRequest({ cvText }, options).request,
      buildJobExtractRequest({ jobText: postingText, sourceUrl: null }, options).request,
      buildCvTailorRequest({ base: baseCv, job, target: resolveTargetLanguage("en") }, options)
        .request,
    ];
    const { url, bodies } = await serve([completed({ ok: true })]);
    for (const built of requests) await client(url).complete(built);
    const offenders: string[] = [];
    const visit = (node: unknown, path: string) => {
      if (Array.isArray(node)) return node.forEach((child, i) => visit(child, `${path}/${i}`));
      if (node === null || typeof node !== "object") return;
      const record = node as Record<string, unknown>;
      if ("$ref" in record && Object.keys(record).length > 1) offenders.push(path);
      for (const [key, value] of Object.entries(record)) visit(value, `${path}/${key}`);
    };
    bodies.forEach((body, index) => visit(JSON.parse(body), String(index)));
    expect(bodies).toHaveLength(3);
    expect(offenders).toEqual([]);
  });

  it("toOpenAiStrictSchema keeps the $ref and drops its siblings only", () => {
    expect(
      toOpenAiStrictSchema({
        properties: {
          id: { $ref: "#/$defs/Id", description: "x" },
          n: { type: "string", description: "kept" },
        },
      }),
    ).toEqual({
      properties: { id: { $ref: "#/$defs/Id" }, n: { type: "string", description: "kept" } },
    });
  });
});
