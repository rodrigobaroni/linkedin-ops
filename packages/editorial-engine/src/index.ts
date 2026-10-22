// @linkedin-ops/editorial-engine — pure editorial core (ADR-0005): prompt registry, request builders, response
// parsers and checks. No I/O: the worker's adapters perform every call.
/** Persisted with every generation (ADR-0005 §3); keep in sync with package.json. */
export const ENGINE_VERSION = "0.1.0";

export * from "./result.js";
export * from "./runtime.js";
export * from "./llm/port.js";
export * from "./llm/simulated.js";
export * from "./untrusted.js";
export * from "./prompts/common.js";
export * from "./career/requests.js";
export * from "./career/parse.js";
export * from "./career/score.js";
export * from "./career/language.js";
export * from "./career/report.js";
export * from "./career/segments.js";
export * from "./career/ids.js";
export * from "./career/entities.js";
export * from "./career/lint/checker.js";
export * from "./career/lint/cv-banned-phrases.v1.0.0.js";
export * from "./career/lint/cv-competency-lexicon.v1.0.0.js";
