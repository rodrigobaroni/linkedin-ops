# Changelog

All notable changes to `@linkedin-ops/contracts`. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning: internal SemVer (see `README.md`).

## [0.1.0] - 2026-10-13

### Added

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
