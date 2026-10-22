import { describe, expect, it } from "vitest";
import {
  ERROR_MESSAGE_OMITTED,
  ERROR_SEARCH_CIRCULAR,
  ERROR_SEARCH_TRUNCATED,
  MAX_ERROR_SEARCH_DEPTH,
  serializeErrorForLog,
  serializeErrorsDeep,
} from "../src/logging/safe-error.js";
import {
  DatabaseError,
  PrismaClientKnownRequestError,
  PrismaClientValidationError,
  ROW_CANARY,
} from "./fixtures/prisma-errors.js";

describe("serializeErrorForLog (QA #101)", () => {
  it("keeps only class, code and the database message of a Prisma error, never meta nor the row", () => {
    const out = serializeErrorForLog(new PrismaClientKnownRequestError());
    expect(out).toEqual({
      type: "PrismaClientKnownRequestError",
      code: "P2010",
      message:
        'new row for relation "job_postings" violates check constraint "job_postings_url_check". [row omitted]',
    });
    expect(JSON.stringify(out)).not.toContain(ROW_CANARY);
  });

  it("omits the message of a validation error (it prints the call's arguments)", () => {
    const out = serializeErrorForLog(new PrismaClientValidationError());
    expect(out).toEqual({ type: "PrismaClientValidationError", message: ERROR_MESSAGE_OMITTED });
  });

  it("drops driver detail, key values and extra properties, also in the cause and the stack", () => {
    const wrapped = new Error("enqueue failed", { cause: new DatabaseError() });
    const out = serializeErrorForLog(wrapped);
    const text = JSON.stringify(out);
    expect(text).not.toContain(ROW_CANARY);
    expect(text).not.toContain('"table"');
    expect(text).not.toContain("detail");
    expect(out.cause).toMatchObject({ type: "DatabaseError", code: "23505" });
    expect(out.stack).toMatch(/^Error: enqueue failed\n\s+at /);
  });

  it("never serializes a non-error value", () => {
    expect(serializeErrorForLog({ detail: ROW_CANARY })).toEqual({
      type: "object",
      message: ERROR_MESSAGE_OMITTED,
    });
  });

  it("scrubs the input value quoted by 22P02-style messages", () => {
    const error = Object.assign(new Error(`invalid input syntax for type uuid: "${ROW_CANARY}"`), {
      code: "22P02",
    });
    expect(serializeErrorForLog(error)).toMatchObject({
      code: "22P02",
      message: "invalid input syntax for type uuid: [value omitted]",
    });
  });
});

describe("serializeErrorsDeep (#102)", () => {
  it("reduces errors under any key and nested, keeping everything else", () => {
    const out = serializeErrorsDeep({
      exception: new DatabaseError(),
      ctx: { err: new PrismaClientKnownRequestError(), step: "fetch", n: 2 },
      list: [new PrismaClientValidationError(), "ok"],
      when: new Date(0),
    }) as Record<string, unknown>;
    expect(out["exception"]).toMatchObject({ type: "DatabaseError", code: "23505" });
    expect(out["ctx"]).toMatchObject({
      err: { type: "PrismaClientKnownRequestError" },
      step: "fetch",
      n: 2,
    });
    expect(out["list"]).toEqual([
      { type: "PrismaClientValidationError", message: ERROR_MESSAGE_OMITTED },
      "ok",
    ]);
    expect(out["when"]).toEqual(new Date(0));
    expect(JSON.stringify(out)).not.toContain(ROW_CANARY);
  });

  it("fails closed below the search depth and on cycles", () => {
    let deep: Record<string, unknown> = { err: new DatabaseError() };
    for (let i = 0; i < MAX_ERROR_SEARCH_DEPTH; i += 1) deep = { deeper: deep };
    expect(JSON.stringify(serializeErrorsDeep(deep))).not.toContain(ROW_CANARY);
    expect(JSON.stringify(serializeErrorsDeep(deep))).toContain(ERROR_SEARCH_TRUNCATED);
    const cycle: Record<string, unknown> = { err: new DatabaseError() };
    cycle["self"] = cycle;
    expect(serializeErrorsDeep(cycle)).toMatchObject({ self: ERROR_SEARCH_CIRCULAR });
    // An already reduced error passes through unchanged (the serializers are idempotent).
    const reduced = serializeErrorForLog(new DatabaseError());
    expect(serializeErrorsDeep(reduced)).toEqual(reduced);
  });
});
