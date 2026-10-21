import { v7 as uuidv7 } from "uuid";

export const CORRELATION_ID_HEADER = "x-correlation-id";

/** `req_<uuid v7>`: sortable, unique per request; echoed in Problem Details and in every log line. */
export function newCorrelationId(): string {
  return `req_${uuidv7()}`;
}
