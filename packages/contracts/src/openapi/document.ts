/**
 * OpenAPI 3.0.3 document generated from the route registry (`routes/v1.ts`) and the Zod schemas, with
 * `z.toJSONSchema` only (contracts.md §5–6: no extra dependency). `openapi/v1.json` is this document
 * serialized; `test/openapi.test.ts` fails when the two diverge (contract drift) and the api serves the
 * same object at `GET /api/v1/openapi.json`.
 */
import { z } from "zod";
import { PROBLEM_CONTENT_TYPE, ProblemDetailsSchema } from "../common/problem.js";
import type { RouteDefinition } from "../routes/define.js";
import { pathParamNames } from "../routes/define.js";
import {
  API_V1_BASE_PATH,
  CSRF_TOKEN_HEADER,
  IDEMPOTENCY_KEY_HEADER,
  REQUESTED_WITH_HEADER,
  routesV1,
  SESSION_COOKIE_NAME,
} from "../routes/v1.js";

export const OPENAPI_VERSION = "3.0.3";
export const OPENAPI_INFO_VERSION = "0.1.0";
export const COMPONENTS_PREFIX = "#/components/schemas/";

export type JsonObject = Record<string, unknown>;
export interface OpenApiDocument extends JsonObject {
  openapi: string;
  info: { title: string; version: string; description: string };
  servers: { url: string }[];
  paths: Record<string, JsonObject>;
  components: { schemas: Record<string, JsonObject>; securitySchemes: Record<string, JsonObject> };
  tags: { name: string }[];
}

const SECURITY_SCHEME = "sessionCookie";

function pascal(value: string): string {
  return value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join("");
}

/** `{param}` placeholders stay as they are: that is OpenAPI's own path template syntax. */
function toOpenApiPath(path: string): string {
  return path;
}

interface Registry {
  registry: z.core.$ZodRegistry<{ id?: string }>;
  idOf(schema: z.ZodType): string;
}

/**
 * One registry with every schema that carries `.meta({ id })` plus a synthetic, route-derived id for
 * the few request/response schemas that do not (e.g. `DraftsListQuery`). Registration order is the
 * registry order, so component names are deterministic.
 */
function buildRegistry(): Registry {
  const registry = z.registry<{ id?: string }>();
  // `_idmap` is private zod API. A zod upgrade must regenerate and review `openapi/v1.json`; the drift
  // test in `test/openapi.test.ts` fails if the internals change.
  for (const [id, schema] of z.globalRegistry._idmap) registry.add(schema as z.ZodType, { id });
  for (const [key, route] of Object.entries(routesV1) as [string, RouteDefinition][]) {
    for (const part of ["params", "query", "body"] as const) {
      const schema = route[part];
      if (schema && registry.get(schema)?.id === undefined) {
        registry.add(schema, { id: `${pascal(key)}${pascal(part)}` });
      }
    }
    for (const [status, schema] of Object.entries(route.responses)) {
      if (schema && registry.get(schema)?.id === undefined) {
        registry.add(schema, { id: `${pascal(key)}Response${status}` });
      }
    }
  }
  return {
    registry,
    idOf(schema) {
      const id = registry.get(schema)?.id;
      if (id === undefined) throw new Error("Schema is not registered");
      return id;
    },
  };
}

function ref(id: string): JsonObject {
  return { $ref: `${COMPONENTS_PREFIX}${id}` };
}

function problemResponse(description: string): JsonObject {
  return {
    description,
    content: { [PROBLEM_CONTENT_TYPE]: { schema: ref("ProblemDetails") } },
  };
}

/** Query/path parameters, one per property of the (strict) object schema. */
function parametersOf(
  location: "query" | "path",
  schema: z.ZodType | undefined,
  components: Record<string, JsonObject>,
  idOf: (schema: z.ZodType) => string,
): JsonObject[] {
  if (!schema) return [];
  const component = components[idOf(schema)];
  if (!component) throw new Error(`Missing component for ${location} parameters`);
  const properties = (component.properties ?? {}) as Record<string, JsonObject>;
  const required = new Set((component.required ?? []) as string[]);
  return Object.entries(properties).map(([name, property]) => {
    const { description, ...propertySchema } = property;
    return {
      name,
      in: location,
      required: location === "path" ? true : required.has(name),
      ...(typeof description === "string" ? { description } : {}),
      schema: propertySchema,
    };
  });
}

function operationOf(
  key: string,
  route: RouteDefinition,
  components: Record<string, JsonObject>,
  idOf: (schema: z.ZodType) => string,
): JsonObject {
  const mutation = route.method !== "GET";
  const parameters = [
    ...parametersOf("path", route.params, components, idOf),
    ...parametersOf("query", route.query, components, idOf),
  ];
  if (route.idempotencyKey) {
    parameters.push({
      name: IDEMPOTENCY_KEY_HEADER,
      in: "header",
      required: route.idempotencyKey === "required",
      description:
        "UUID; same key + same body replays the response, same key + different body → 409",
      schema: { type: "string", format: "uuid" },
    });
  }
  if (mutation) {
    parameters.push({
      name: REQUESTED_WITH_HEADER.name,
      in: "header",
      required: true,
      description: "CSRF defense in depth (ADR-0007 N4)",
      schema: { type: "string", enum: [REQUESTED_WITH_HEADER.value] },
    });
  }
  if (route.auth === "elevated") {
    parameters.push({
      name: CSRF_TOKEN_HEADER,
      in: "header",
      required: true,
      description: "CSRF token bound to the session (ADR-0007 N2); the session must be elevated",
      schema: { type: "string" },
    });
  }

  const responses: Record<string, JsonObject> = {};
  for (const [status, schema] of Object.entries(route.responses)) {
    responses[status] = schema
      ? { description: "OK", content: { "application/json": { schema: ref(idOf(schema)) } } }
      : { description: status === "302" ? "Redirect" : "No content" };
  }
  if (route.params || route.query || route.body)
    responses["400"] = problemResponse("VALIDATION_FAILED");
  if (route.auth !== "none") {
    responses["401"] = problemResponse(
      route.auth === "elevated" ? "AUTH_REQUIRED | AUTH_REAUTH_REQUIRED" : "AUTH_REQUIRED",
    );
  }
  if (mutation || route.roles) {
    responses["403"] = problemResponse(mutation ? "CSRF_REJECTED | FORBIDDEN" : "FORBIDDEN");
  }
  if (route.params) responses["404"] = problemResponse("NOT_FOUND");
  if (route.rateLimited)
    responses["429"] = problemResponse("RATE_LIMITED (Retry-After in seconds)");
  responses["default"] = problemResponse("Problem Details (contracts.md §4)");

  const requestContentType = route.requestContentType ?? "application/json";
  return {
    operationId: key,
    summary: route.summary,
    tags: [route.tag],
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(route.body
      ? {
          requestBody: {
            required: true,
            content: { [requestContentType]: { schema: ref(idOf(route.body)) } },
          },
        }
      : {}),
    responses,
    security: route.auth === "none" ? [] : [{ [SECURITY_SCHEME]: [] }],
    "x-auth": route.auth,
    ...(route.roles ? { "x-roles": [...route.roles] } : {}),
    ...(route.async ? { "x-async": true } : {}),
    ...(route.idempotencyKey ? { "x-idempotency-key": route.idempotencyKey } : {}),
    ...(route.rateLimited ? { "x-rate-limited": true } : {}),
  };
}

/**
 * Builds the document. Components are emitted with `io: "input"`: request schemas describe exactly
 * what the client may send (`strictObject` → `additionalProperties: false`, defaults as `default`), and
 * response DTOs are documented as the API produces them without the closed-object marker, matching the
 * "unknown fields are ignored" compatibility rule of contracts.md §1.
 */
export function buildOpenApiDocument(): OpenApiDocument {
  const { registry, idOf } = buildRegistry();
  const generated = z.toJSONSchema(registry, {
    target: "openapi-3.0",
    io: "input",
    unrepresentable: "any",
    uri: (id) => `${COMPONENTS_PREFIX}${id}`,
  }) as { schemas: Record<string, JsonObject> };

  const schemas: Record<string, JsonObject> = {};
  for (const id of Object.keys(generated.schemas).sort()) {
    const { $id: _id, ...schema } = generated.schemas[id]!;
    schemas[id] = schema;
  }
  if (!schemas[idOf(ProblemDetailsSchema)]) throw new Error("ProblemDetails component missing");

  const paths: Record<string, JsonObject> = {};
  const tags = new Set<string>();
  for (const [key, route] of Object.entries(routesV1) as [string, RouteDefinition][]) {
    const path = toOpenApiPath(route.path);
    const declared = pathParamNames(path);
    if (route.params && declared.length === 0)
      throw new Error(`${key}: params without placeholders`);
    tags.add(route.tag);
    const item = (paths[path] ??= {});
    item[route.method.toLowerCase()] = operationOf(key, route, schemas, idOf);
  }

  return {
    openapi: OPENAPI_VERSION,
    info: {
      title: "LinkedIn Ops API",
      version: OPENAPI_INFO_VERSION,
      description:
        "Generated from @linkedin-ops/contracts (routes/v1.ts + Zod schemas). Errors are RFC 9457 Problem Details with a stable `code` (contracts.md §4).",
    },
    servers: [{ url: API_V1_BASE_PATH }],
    tags: [...tags].sort().map((name) => ({ name })),
    paths,
    components: {
      schemas,
      securitySchemes: {
        [SECURITY_SCHEME]: {
          type: "apiKey",
          in: "cookie",
          name: SESSION_COOKIE_NAME,
          description:
            "Server-side session (ADR-0007). Mutations also require Origin = APP_BASE_URL, Content-Type: application/json and X-Requested-With: linkedin-ops (N4).",
        },
      },
    },
  };
}

/** Canonical serialization committed as `openapi/v1.json` (2-space JSON, trailing newline). */
export function serializeOpenApiDocument(
  document: OpenApiDocument = buildOpenApiDocument(),
): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}
