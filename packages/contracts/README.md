# @linkedin-ops/contracts

Zod schemas, inferred types, REST route registry, job catalogue and Structured Output schemas shared by
`web`, `api`, `worker`, `editorial-engine` and `domain`. **Shape only**: no business logic, no I/O, no
framework. The only runtime dependency is `zod` (v4).

Specification: `docs/architecture/contracts.md` (§6 layout and rules), `docs/architecture/data-model.md`,
`docs/editorial/structured-outputs.md`, briefing §13 (`docs/product/maestro-prompt.md`).

## Layout

```text
src/
  common/     ids, datetime (IsoDateTime, LocalDateTime, IanaTimezone), pagination, actor, async,
              problem (RFC 9457 + ErrorCode), json-schema (toJsonSchema / toOpenApiSchema / toStructuredOutputSchema)
  enums/      UserRole, AutonomyMode, Language, OpportunityStatus (lowercase, §13), SuggestedFormat, DraftStatus,
              ContentState + ContentEvent, ApprovalDecision, ScheduleStatus, PublicationStatus, Media*, Notification*, …
  resources/  one file per REST resource: DTO (`XSchema`), inputs (`XInputSchema`, `XPatchSchema`) and list queries
  state/      content-transitions: the data-model.md §3.1 table as data + canTransition / resolveTransition
  routes/     v1.ts — the registry of /api/v1 routes (method, path, params, query, body, responses, auth, idempotency)
  jobs/       queues.ts — pg-boss queue names, payload schemas (schemaVersion, correlationId, requestedBy), retry/singleton
  engine/     structured-outputs.ts — model output schemas (OpenAI strict) + STRUCTURED_OUTPUTS registry
test/         Vitest: valid example + ≥2 invalid variants per schema, transitions, routes, queues, strict mode,
              "no secret in any response", import boundaries
```

## Conventions

- `XSchema` is the Zod schema, `X` the inferred type. Enums also export a value object: `DraftStatus.IN_REVIEW`.
- Enum values are `SCREAMING_SNAKE`, except the briefing §13 values (`candidate`, `code-card`), kept lowercase.
- Instants are ISO 8601 UTC with `Z` (`IsoDateTimeSchema`). Wall-clock input is always `LocalDateTime`
  (`YYYY-MM-DDTHH:mm`) **plus** an `IanaTimezone`; offsets are rejected.
- Optional-in-response fields use `.nullable()`. `.optional()` is reserved for request inputs and for fields the API
  may omit for some roles (`generation.usage`). Structured Output schemas never use `.optional()` (strict mode).
- Schemas registered with `.meta({ id })` become `$defs` in JSON Schema and components in OpenAPI.
- No response schema contains a field matching `/token|secret|password|apiKey/i` — a test enforces it.
- Mutations on drafts carry `expectedRowVersion` (`409 ROW_VERSION_MISMATCH`).

## Usage

```ts
import {
  DraftScheduleInputSchema,
  routesV1,
  QUEUES,
  structuredOutputJsonSchema,
  canTransition,
} from "@linkedin-ops/contracts";

const input = DraftScheduleInputSchema.parse(body); // api pipe / RHF resolver
routesV1["drafts.schedule"].path; // "/drafts/{id}/schedule"
QUEUES["publication.publish"].retryLimit; // 0 (ADR-0003)
structuredOutputJsonSchema("postDraft"); // { name, strict: true, schema } for text.format json_schema
canTransition("IN_REVIEW", "APPROVED"); // true — table only; guards live in packages/domain
```

## Versioning

Internal SemVer, recorded in `CHANGELOG.md` (Keep a Changelog). The monorepo always consumes one version, so the
discipline is about **jobs in flight** and **the HTTP contract**:

- **Patch**: descriptions, tests, non-behavioral refactors.
- **Minor** (additive): new optional field, new route, new enum value, new queue. Payloads keep `schemaVersion`.
- **Major** (incompatible): removed/renamed field, changed semantics, removed enum value → new `/api/v2` and/or a new
  `schemaVersion` on the affected queue; handlers accept N-1 during the deploy window (contracts.md §5).

Every change that breaks `web`/`worker` is a PR touching the consumers, reviewed by Atlas (contracts.md §6 rule 7).

## Out of scope here

OpenAPI document generation and the drift test (`openapi/v1.json`) land with the API baseline (T-008) on top of
`toOpenApiSchema` and `routesV1`. Prisma enum parity tests land with T-005.
