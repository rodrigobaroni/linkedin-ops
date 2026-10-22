import { Writable } from "node:stream";
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
});
