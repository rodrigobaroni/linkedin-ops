# Changelog

All notable changes to `@linkedin-ops/contracts`. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning: internal SemVer (see `README.md`).

## [Unreleased]

### Added

- Career module (spec `2026-10-22-cv-tailoring-design.md`, prompts `docs/editorial/career-prompts.md` v1.0.0):
  `career/schemas.ts` with content schemas `CvStructured`, `JobPostingExtracted`, `TailoredCvContent` (segments with
  `provenance: original | rewritten | added`, `sourceCvItemIds` for base content, `targetRequirementIds` +
  `additionNote` for added content) and `MatchReport` (`baseScore` 0–100 computed by the engine from the base-CV
  `matchAssessment`, before additions), plus model outputs `CvExtractionOutput`, `JobExtractionOutput`,
  `CvTailoringOutput` and `CvHumanizationOutput` (Pena's field names) registered in `STRUCTURED_OUTPUTS`.
  `PromptId` gains `cv-extract`, `job-extract`, `cv-tailor`, `cv-humanize`. All career objects are `strictObject`.
- CV base (career PR 2): routes `career.cv.get`, `career.cv.upload` (multipart, `202 CvUploadAccepted` extending
  `AsyncAccepted`, rate limited), `career.cv.confirm` and `career.cv.delete` (elevated, OWNER only); resources
  `CvDraft`, `CvBase`, `CvBaseState`, `CvUploadAccepted`, `CvConfirmInput` and `CV_UPLOAD_LIMITS`; enums
  `CvDraftStatus` (`EXTRACTING | READY | FAILED`) and `CvExtractionFailure` (`EXTRACTION_FAILED | TIMED_OUT`);
  `ErrorCode` gains `CV_PDF_UNREADABLE` (422) and `CV_DRAFT_NOT_READY` (409) (contracts.md §2.13, §4).
- `cv.extract` wiring: `CvDraft` gains required `parseWarnings` (`[]` until `READY`) and `injectionSuspected`, and
  optional `injectionEvidence` (≤ 500 characters); `CvConfirmInput` gains optional `acknowledgeInjection`, required to confirm a draft flagged
  `injectionSuspected` (ADR-0005 §4, fail closed); `ErrorCode` gains `CV_INJECTION_UNACKNOWLEDGED` (409).
- Job postings (career PR 3b): routes `career.batches.create` (`202 TailoringBatchAccepted`, extends
  `AsyncAccepted`; 1–20 links), `career.jobs.list` (cursor = last id), `career.jobs.get`, `career.jobs.pasteText`
  and `career.jobs.retry` (`202 JobPostingAccepted`) and `career.jobs.delete`; resources `TailoringBatchInput`,
  `JobPostingUrl` (http(s) with a domain, no credentials, ≤ 2048), `JobPostingTextInput` (200–20 000 characters),
  `JobPostingListQuery`, `JobPostingSummary`, `JobPostingDetail`, `JobPostingTailoring` (with
  `generatedWithPreviousCv`) and `JOB_POSTING_LIMITS`; enums `JobPostingStatus`
  (`FETCHING | ANALYZING | READY | FAILED`), `JobPostingFailure` (`FETCH | FETCH_BLOCKED | NOT_A_JOB | AI |
  TIMED_OUT`) and `JobPostingSourceKind` (`LINKEDIN | OTHER | PASTED`); `ErrorCode` gains `CV_BASE_REQUIRED` (412)
  and `JOB_POSTING_INVALID_TRANSITION` (409) (contracts.md §2.14, §4).
- Queues `cv.extract` (`{ cvBaseId }`, retry 2 with backoff), `job.fetch` (`{ jobPostingId }`, retry 1 after 60 s,
  ADR-0008 §4) and `cv.tailor` (`{ jobPostingId }`, retry 2 with backoff). Payloads carry ids only.
- `openapi/document.ts` (`buildOpenApiDocument`, `serializeOpenApiDocument`): OpenAPI 3.0.3 generated from `routes/v1.ts`
  with `z.toJSONSchema` only; committed as `openapi/v1.json` with a drift test (`pnpm openapi:generate` refreshes it).
  Components are named after `.meta({ id })`; `IdParams`, `DraftVersionParams` and `<Item>Page` gained ids (T-008).
  The generator reads `z.globalRegistry._idmap` (private zod API): any zod bump must regenerate and review `v1.json`.
- `ErrorCode` gains `PAYLOAD_TOO_LARGE` (413) and `UNSUPPORTED_MEDIA_TYPE` (415) for transport-level rejections
  (contracts.md §4, T-008). `ReadinessCheck` gains `skipped` for dependencies not wired yet (pg-boss before T-006).

## [0.1.0] - 2026-10-13

### Changed

- `ErrorCode` gains `IDEMPOTENCY_KEY_CONFLICT` (409): same `Idempotency-Key` reused on the same route with a
  different body (contracts.md §1, PR #73); `IDEMPOTENCY_KEY_REQUIRED` stays 400.

- QA (Crivo, PR #68): `CurationRunDetail` and `OpportunityBatch` enforce invariant I1 — a `SUCCEEDED` run carries
  exactly five opportunities with distinct ids and ranks 1..5; `OpportunityBatch` gains `status`. `ProblemDetails`
  rejects incoherent `code`/`status`/`type` triples and allows `errors[]` only with `VALIDATION_FAILED`.

- ADR-0007 N2: `POST /auth/login` → `200 LoginResponse { csrfToken, elevatedUntil: null }` and `POST /auth/reauth` →
  `200 ReauthResponse { csrfToken, elevatedUntil }` (were `204`); `Me` gains `csrfToken` and `elevatedUntil`.
  `csrfToken` is the only `*Token` field any response may carry (contract test); audit snapshots still reject it.

### Security

- Request bodies, query strings, path params and job payloads are `z.strictObject`: unknown keys fail validation
  instead of being stripped (threat model TM-06). `PasswordSchema` requires 15 characters (ADR-0007).
- `AuditEvent.before/after` use `RedactedJsonObjectSchema`: credential-like keys (`SENSITIVE_KEY_PATTERN`) are rejected
  at any depth, nesting and size are bounded (I10, TM-04).
- `LinkedInCallbackQuery` requires exactly one of `code`/`error`. High-risk routes (LinkedIn connect/disconnect,
  autonomy update, publish, retry-publication) are `elevated`, `OWNER_ONLY` and `rateLimited` (ADR-0007 §3, §10, §11).

### Added

- Rule: `DraftVersion.eval.quality` types the API DTO with the model's `QualityEvaluation` (schemaVersion `1.0`). A
  bump of the model schema is therefore an API change: treat it as additive (new nullable field, never remove) or
  version it (Atlas review of T-004, R4).
- Rule: every `202 Accepted` body extends `AsyncAccepted { id, status, jobId }` and keeps its named ids
  (`draftId`, `publicationId`, …), so clients have one base type for every async action (Atlas review, R2).

- `common/`: `Uuid`, `Slug`, `LinkedInUrn`, `IdempotencyKey`, `RowVersion`, `Semver`, `HttpsUrl`; `IsoDateTime`,
  `LocalDateTime`, `IanaTimezone`, `LocalSlot`; cursor pagination; `ActorType`/`AuditActorType`/`RequestedBy`;
  `AsyncAccepted`, `ClassifiedError`; RFC 9457 `ProblemDetails` with stable `ErrorCode` and HTTP status map;
  `toJsonSchema`, `toOpenApiSchema`, `toStructuredOutputSchema`, `findStrictModeViolations`.
- `enums/`: all enums of `data-model.md` and briefing §13, including `ContentState`/`ContentEvent`.
- `resources/`: DTOs, inputs and list queries for auth/sessions, LinkedIn integration, autonomy and notification
  settings, voice profile, story bank, content pillars, sources, source items (`untrusted: true`), watchlists,
  curation runs, opportunities (briefing §13 verbatim + internals, `scoreBreakdown` with `voiceFit`/`risk`), drafts and
  versions (`hooks: { text, formula, rationale }[]`, `mediaSuggestion.altText` required), approvals (SYSTEM requires
  `reason` + `policySnapshot`), schedules (timezone explicit), publications, media assets, notifications, audit events.
- `state/content-transitions`: transition table of `data-model.md` §3.1 as data, `canTransition`, `resolveTransition`,
  `transitionsFrom`, `TERMINAL_CONTENT_STATES`, `OPPORTUNITY_STATUS_TO_CONTENT_STATE`.
- `routes/v1`: registry of every `/api/v1` route in `contracts.md` §2 (auth level, idempotency, async, roles).
- `jobs/queues`: the 12 queues of `contracts.md` §6.1 with versioned payloads, retry policy, singleton keys, DLQ names.
- `engine/structured-outputs`: `OpportunityClassification`, `EditorialBrief`, `PostDraft`, `MediaSuggestionOutput`,
  `QualityEvaluation`, `VoiceProfileExtraction` (schemaVersion `1.0`) plus shared `$defs` and the
  `STRUCTURED_OUTPUTS` registry keyed by prompt id.
