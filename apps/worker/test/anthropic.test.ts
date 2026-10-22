import { describe, expect, it } from "vitest";
import { LlmError, buildCvExtractRequest, type LlmRequest } from "@linkedin-ops/editorial-engine";
import { AnthropicLlmClient } from "../src/llm/anthropic.js";
import type { LlmCallEvent } from "../src/llm/openai.js";
import { cvText } from "./fixtures.js";

// Fictional canary, assembled at run time so secret scanners do not see a key-shaped literal.
const API_KEY = ["sk", "ant", "test", "canary", "0123456789abcdef"].join("-");
const SECRET_INPUT = "CANARY-CV-CONTENT Ana Exemplo";

const request: LlmRequest = {
  promptId: "cv-extract",
  promptVersion: "1.0.0",
  model: "claude-test",
  instructions: "SYSTEM TEXT",
  input: SECRET_INPUT,
  outputSchema: {
    name: "Out",
    strict: true,
    schema: {
      type: "object",
      properties: { ok: { type: "boolean" }, name: { type: "string", maxLength: 5 } },
      required: ["ok"],
      additionalProperties: false,
    },
  },
  maxOutputTokens: 100,
};

/** Server-sent events of one Messages API stream with a single text block. */
function sse(text: string, stopReason = "end_turn"): string {
  const events: Array<[string, unknown]> = [
    [
      "message_start",
      {
        type: "message_start",
        message: {
          id: "msg_test",
          type: "message",
          role: "assistant",
          model: "claude-test",
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 11, output_tokens: 0 },
        },
      },
    ],
    [
      "content_block_start",
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    ],
    [
      "content_block_delta",
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
    ],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    [
      "message_delta",
      {
        type: "message_delta",
        delta: { stop_reason: stopReason, stop_sequence: null },
        usage: { output_tokens: 7 },
      },
    ],
    ["message_stop", { type: "message_stop" }],
  ];
  return events
    .map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    .join("");
}

interface Captured {
  url: string;
  headers: Headers;
  body: Record<string, unknown>;
}

function fakeFetch(
  respond: () => Response,
  captured: Captured[] = [],
): { fetch: typeof fetch; captured: Captured[] } {
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    captured.push({
      url: String(input),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
    });
    return respond();
  }) as typeof fetch;
  return { fetch: impl, captured };
}

function streamResponse(text: string, stopReason?: string): Response {
  return new Response(sse(text, stopReason), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function errorResponse(status: number, type: string): Response {
  return new Response(
    JSON.stringify({ type: "error", error: { type, message: `echo ${SECRET_INPUT}` } }),
    { status, headers: { "content-type": "application/json" } },
  );
}

function client(fetchImpl: typeof fetch, events: LlmCallEvent[] = []): AnthropicLlmClient {
  return new AnthropicLlmClient({
    apiKey: API_KEY,
    fetch: fetchImpl,
    maxRetries: 0,
    onEvent: (event) => events.push(event),
  });
}

describe("AnthropicLlmClient (ADR-0011)", () => {
  it("sends system + data as separate fields with a json_schema output format and parses the JSON text", async () => {
    const { fetch, captured } = fakeFetch(() => streamResponse('{"ok":true}'));
    const events: LlmCallEvent[] = [];
    const response = await client(fetch, events).complete(request);

    expect(response).toEqual({
      output: { ok: true },
      model: "claude-test",
      usage: { inputTokens: 11, outputTokens: 7 },
    });
    const sent = captured[0]!;
    expect(sent.url).toMatch(/\/v1\/messages$/);
    expect(sent.headers.get("x-api-key")).toBe(API_KEY);
    expect(sent.body.system).toBe("SYSTEM TEXT");
    expect(sent.body.messages).toEqual([{ role: "user", content: SECRET_INPUT }]);
    expect(sent.body.max_tokens).toBe(200);
    const format = (sent.body.output_config as { format: { type: string; schema: unknown } })
      .format;
    expect(format.type).toBe("json_schema");
    // Unsupported constraints are stripped from what is sent; the engine still validates the output.
    expect(JSON.stringify(format.schema)).not.toContain('"maxLength":');
    expect(events).toEqual([expect.objectContaining({ outcome: "ok", status: 200, attempt: 1 })]);
  });

  it("works with a real engine request (cv-extract builder)", async () => {
    const { fetch, captured } = fakeFetch(() => streamResponse('{"ok":true}'));
    const options = { model: "claude-test", rng: { hex: (n: number) => "e".repeat(n) } };
    const real = buildCvExtractRequest({ cvText }, options).request;
    await client(fetch).complete(real);
    expect(captured[0]!.body.output_config).toBeDefined();
  });

  it.each([
    ["refusal", "REFUSAL"],
    ["max_tokens", "INCOMPLETE"],
  ])("stop_reason %s → %s", async (stopReason, kind) => {
    const { fetch } = fakeFetch(() => streamResponse('{"ok":true}', stopReason));
    await expect(client(fetch).complete(request)).rejects.toMatchObject({ kind });
  });

  it("non-JSON text → INVALID_OUTPUT", async () => {
    const { fetch } = fakeFetch(() => streamResponse("not json"));
    await expect(client(fetch).complete(request)).rejects.toMatchObject({ kind: "INVALID_OUTPUT" });
  });

  it.each([
    [401, "authentication_error", "AUTH"],
    [429, "rate_limit_error", "RATE_LIMITED"],
    [529, "overloaded_error", "UNAVAILABLE"],
    [400, "billing_error", "QUOTA_EXCEEDED"],
    [400, "invalid_request_error", "INVALID_REQUEST"],
  ])("HTTP %s %s → %s, without echoing the body", async (status, type, kind) => {
    const { fetch } = fakeFetch(() => errorResponse(status, type));
    const events: LlmCallEvent[] = [];
    const error = await client(fetch, events)
      .complete(request)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LlmError);
    expect(error).toMatchObject({ kind, status });
    expect(String((error as Error).message)).not.toContain("CANARY");
    expect(JSON.stringify(events)).not.toMatch(/CANARY|sk-ant/);
  });

  it("a schema too large for constrained decoding falls back to prompt-only JSON, once per schema", async () => {
    let call = 0;
    const tooLarge = () =>
      new Response(
        JSON.stringify({
          type: "error",
          error: { type: "invalid_request_error", message: "The compiled grammar is too large" },
        }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    const { fetch, captured } = fakeFetch(() =>
      call++ === 0 ? tooLarge() : streamResponse('```json\n{"ok":true}\n```'),
    );
    const llm = client(fetch);
    expect((await llm.complete(request)).output).toEqual({ ok: true });
    expect((await llm.complete(request)).output).toEqual({ ok: true });

    expect(captured).toHaveLength(3);
    expect(captured[0]!.body.output_config).toBeDefined();
    // Prompt-only: no output_config, the schema follows the unchanged instructions in the system prompt.
    for (const sent of captured.slice(1)) {
      expect(sent.body.output_config).toBeUndefined();
      expect(String(sent.body.system)).toMatch(
        /^SYSTEM TEXT\n\n.*JSON Schema:\n\{"type":"object"/s,
      );
    }
  });

  it("an already-aborted signal makes no request", async () => {
    const { fetch, captured } = fakeFetch(() => streamResponse('{"ok":true}'));
    const controller = new AbortController();
    controller.abort();
    await expect(
      client(fetch).complete(request, { signal: controller.signal }),
    ).rejects.toMatchObject({ kind: "ABORTED" });
    expect(captured).toHaveLength(0);
  });
});
