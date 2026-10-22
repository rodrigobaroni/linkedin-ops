import { Writable } from "node:stream";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { createLogger } from "../src/logger.js";

const ROW_CANARY = "CANARIO-LINHA-0000";

/** Shaped like a Prisma 7 + adapter-pg CHECK violation: the offending row in `meta` and in the message. */
class PrismaClientKnownRequestError extends Error {
  readonly code = "P2010";
  readonly meta = {
    driverAdapterError: { cause: { detail: `Failing row contains (${ROW_CANARY}).` } },
  };

  constructor() {
    super(
      `Invalid invocation:\nnew row violates check constraint "x". Failing row contains (${ROW_CANARY}).`,
    );
    this.name = "PrismaClientKnownRequestError";
  }
}

describe("worker logger (QA #101)", () => {
  it("logs a Prisma error with class, code and message only, never the row", () => {
    let output = "";
    const stream = new Writable({
      write: (chunk: Buffer, _encoding, callback) => {
        output += chunk.toString("utf8");
        callback();
      },
    });
    const logger = createLogger("info", stream);
    logger.error({ err: new PrismaClientKnownRequestError() }, "job failed");
    logger.warn(
      { error: new Error("wrapped", { cause: new PrismaClientKnownRequestError() }) },
      "x",
    );
    const [first] = output
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(first?.["err"]).toEqual({
      type: "PrismaClientKnownRequestError",
      code: "P2010",
      message: 'new row violates check constraint "x". [row omitted]',
    });
    expect(output).not.toContain(ROW_CANARY);
    expect(output).not.toContain("driverAdapterError");
  });

  it("never logs a raw error under another key or nested (#102)", () => {
    let output = "";
    const stream = new Writable({
      write: (chunk: Buffer, _encoding, callback) => {
        output += chunk.toString("utf8");
        callback();
      },
    });
    const logger = createLogger("info", stream);
    logger.error({ exception: new PrismaClientKnownRequestError() }, "a");
    logger.error({ ctx: { err: new PrismaClientKnownRequestError() } }, "b");
    logger.error(
      { e: new PrismaClientKnownRequestError(), list: [new PrismaClientKnownRequestError()] },
      "c",
    );
    const lines = output
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(lines[0]?.["exception"]).toMatchObject({
      type: "PrismaClientKnownRequestError",
      code: "P2010",
    });
    expect(lines[1]?.["ctx"]).toMatchObject({ err: { type: "PrismaClientKnownRequestError" } });
    expect(lines[2]?.["e"]).toMatchObject({ type: "PrismaClientKnownRequestError" });
    expect(output).not.toContain(ROW_CANARY);
    expect(output).not.toContain("driverAdapterError");
  });

  function capture() {
    let output = "";
    const stream = new Writable({
      write: (chunk: Buffer, _encoding, callback) => {
        output += chunk.toString("utf8");
        callback();
      },
    });
    return {
      logger: createLogger("info", stream),
      lines: () =>
        output
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line) as Record<string, unknown>),
      text: () => output,
    };
  }

  it("an error logged without a message never puts its raw message in msg (#102 follow-up)", () => {
    const { logger, lines, text } = capture();
    logger.error(new PrismaClientKnownRequestError());
    logger.error({ err: new PrismaClientKnownRequestError() });
    expect(lines().map((line) => line["msg"])).toEqual([
      'new row violates check constraint "x". [row omitted]',
      'new row violates check constraint "x". [row omitted]',
    ]);
    expect(text()).not.toContain(ROW_CANARY);
  });

  it("reduces errors inside class instances and errors of another realm (#102 follow-up)", () => {
    const { logger, lines, text } = capture();
    class StepContext {
      constructor(
        readonly step: string,
        readonly failure: unknown,
      ) {}
    }
    const foreign = runInNewContext(
      `new TypeError("Failing row contains (${ROW_CANARY}).")`,
    ) as unknown;
    expect(foreign instanceof Error).toBe(false);
    logger.error({ ctx: new StepContext("fetch", new PrismaClientKnownRequestError()) }, "a");
    logger.error({ foreign }, "b");
    logger.error(foreign as Error);
    const [first, second, third] = lines();
    expect(first?.["ctx"]).toMatchObject({
      step: "fetch",
      failure: { type: "PrismaClientKnownRequestError" },
    });
    expect(second?.["foreign"]).toMatchObject({ type: "TypeError", message: "[row omitted]" });
    expect(third?.["msg"]).toBe("[row omitted]");
    expect(text()).not.toContain(ROW_CANARY);
  });

  it("redacts credentials as the API logger does, at any depth (#102 follow-up)", () => {
    const { logger, text } = capture();
    logger.info(
      {
        password: "SECRET-A",
        cookie: "SECRET-B",
        csrfToken: "SECRET-C",
        token: "SECRET-D",
        authorization: "SECRET-E",
        nested: {
          deeper: { password: "SECRET-F", accessToken: "SECRET-G", clientSecret: "SECRET-H" },
        },
        list: [{ apiKey: "SECRET-I" }],
        usage: { inputTokens: 3 },
      },
      "probe",
    );
    for (const marker of "ABCDEFGHI".split("")) expect(text()).not.toContain(`SECRET-${marker}`);
    expect(text()).toContain('"inputTokens":3');
  });
});
