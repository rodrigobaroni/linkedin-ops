import { describe, expect, it } from "vitest";
import { ERROR_MESSAGE_OMITTED, serializeErrorForLog } from "../src/logging/safe-error.js";
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
});
