import { createParamDecorator, Injectable } from "@nestjs/common";
import type { ExecutionContext, PipeTransform } from "@nestjs/common";
import type { ValidationIssue } from "@linkedin-ops/contracts";
import type { FastifyRequest } from "fastify";
import type { z } from "zod";
import { contractRouteOf } from "./contract-route.decorator.js";
import { ProblemError } from "./problem.error.js";

export type RequestPart = "body" | "query" | "params";

const PART_DETAIL: Record<RequestPart, string> = {
  body: "Corpo da requisição inválido",
  query: "Parâmetros de consulta inválidos",
  params: "Parâmetros de caminho inválidos",
};

/**
 * Validates one request part with a Zod schema from `packages/contracts` (authoritative; `strictObject`
 * rejects unknown keys, TM-06). Failures become `400 VALIDATION_FAILED` with `errors[]` per field.
 */
@Injectable()
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(
    private readonly schema: T,
    private readonly part: RequestPart = "body",
  ) {}

  transform(value: unknown): z.output<T> {
    return parseRequestPart(this.schema, value, this.part);
  }
}

export function parseRequestPart<T extends z.ZodType>(
  schema: T,
  value: unknown,
  part: RequestPart,
): z.output<T> {
  const result = schema.safeParse(value ?? {});
  if (result.success) return result.data;
  const errors: ValidationIssue[] = result.error.issues.flatMap((issue) => {
    const path = issue.path.map((segment) =>
      typeof segment === "symbol" ? String(segment) : segment,
    );
    // `strictObject` reports unknown keys as one issue at the parent; the client wants one per field.
    if (issue.code === "unrecognized_keys") {
      return issue.keys.map((key) => ({ path: [...path, key], message: "Campo não reconhecido" }));
    }
    return [{ path, message: issue.message }];
  });
  throw new ProblemError("VALIDATION_FAILED", { detail: PART_DETAIL[part], errors });
}

function extract(part: RequestPart, context: ExecutionContext): unknown {
  const route = contractRouteOf(context.getHandler());
  if (!route) {
    throw new Error(`@Contract${part} requires a handler decorated with @ContractRoute`);
  }
  const schema = route[part];
  if (!schema) {
    throw new Error(`Contract route ${route.method} ${route.path} declares no ${part} schema`);
  }
  const request = context.switchToHttp().getRequest<FastifyRequest>();
  return parseRequestPart(schema, request[part], part);
}

/** Request body validated by the route's contract `body` schema. */
export const ContractBody = createParamDecorator((_data: unknown, context: ExecutionContext) =>
  extract("body", context),
);
/** Query string validated by the route's contract `query` schema. */
export const ContractQuery = createParamDecorator((_data: unknown, context: ExecutionContext) =>
  extract("query", context),
);
/** Path params validated by the route's contract `params` schema. */
export const ContractParams = createParamDecorator((_data: unknown, context: ExecutionContext) =>
  extract("params", context),
);
