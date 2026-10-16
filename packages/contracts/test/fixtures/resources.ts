import * as c from "../../src/index.js";
import { DELETE, drop, patch, repeat, replace, set, type SchemaCase } from "../helpers.js";
import { AT, LATER, SHA256, ids } from "./ids.js";
import { qualityEvaluation } from "./structured-outputs.js";

const TZ = "America/Sao_Paulo";

export const user: c.User = {
  id: ids.user,
  email: "rodrigo@example.com",
  name: "Rodrigo",
  role: "OWNER",
  locale: "pt-BR",
  timezone: TZ,
  linkedinMemberUrn: "urn:li:person:abc123",
  createdAt: AT,
  updatedAt: AT,
};

const CSRF = "c".repeat(43);

export const me: c.Me = {
  csrfToken: CSRF,
  elevatedUntil: null,
  id: ids.user,
  email: user.email,
  name: user.name,
  role: "OWNER",
  locale: "pt-BR",
  timezone: TZ,
  linkedinConnected: true,
};

export const sessionSummary: c.SessionSummary = {
  id: ids.session,
  createdAt: AT,
  lastSeenAt: AT,
  ip: "203.0.113.7",
  userAgent: "Mozilla/5.0",
  current: true,
};

export const linkedInIntegration: c.LinkedInIntegration = {
  status: "ACTIVE",
  scopes: ["openid", "profile", "w_member_social"],
  accessExpiresAt: LATER,
  memberUrn: "urn:li:person:abc123",
};

export const quietHours: c.QuietHours = { start: "22:00", end: "07:00", timezone: TZ };

export const autonomySettingsInput: c.AutonomySettingsInput = {
  mode: "ASSISTED",
  autoApproveMinScore: null,
  allowedPillarIds: [],
  maxAutoPostsPerWeek: 3,
  cancelWindowMinutes: 60,
  mediaRequiresHuman: true,
  assistedPrefetchDraft: false,
  quietHours,
};

export const autonomySettings: c.AutonomySettings = { ...autonomySettingsInput, updatedAt: AT };

export const autopilotSettings: c.AutonomySettings = {
  ...autonomySettings,
  mode: "AUTOPILOT_CONTROLLED",
  autoApproveMinScore: 85,
  allowedPillarIds: [ids.pillar],
};

export const notificationSettings: c.NotificationSettings = {
  telegram: { enabled: true, linked: true, chatIdMasked: "***1234", linkedAt: AT },
  inApp: { enabled: true },
};

export const voiceProfileInput: c.VoiceProfileInput = {
  language: "pt-BR",
  tone: "Direto, técnico, sem jargão de marketing.",
  principles: ["Um pensamento por parágrafo."],
  avoid: ["Pontes de revelação."],
  bannedPhrases: ["A verdade é que"],
  vocabulary: [{ term: "deploy", note: "sempre em inglês" }],
  examples: [{ text: "Hoje quebrei produção. De novo.", context: "post de 2025" }],
  notes: null,
};

export const voiceProfile: c.VoiceProfile = {
  ...voiceProfileInput,
  id: ids.voice,
  version: 2,
  isActive: true,
  createdAt: AT,
};

export const storyBankEntryInput: c.StoryBankEntryInput = {
  title: "Migration que derrubou o checkout",
  narrative:
    "Em 2024 rodei uma migration sem revisar o SQL e o checkout ficou fora por 40 minutos.",
  context: "E-commerce, time de 6 pessoas.",
  lesson: "Ler o SQL gerado antes do deploy.",
  facts: [
    { claim: "40 minutos de indisponibilidade", value: "40", sourceUrl: null, verifiedAt: AT },
  ],
  tags: ["migrations", "incidente"],
  pillarIds: [ids.pillar],
};

export const storyBankEntry: c.StoryBankEntry = {
  ...storyBankEntryInput,
  id: ids.story,
  status: "ACTIVE",
  usageCount: 2,
  lastUsedAt: AT,
  createdAt: AT,
  updatedAt: AT,
};

export const contentPillarInput: c.ContentPillarInput = {
  slug: "engenharia",
  name: "Engenharia de software",
  description: "Arquitetura, operação e decisões técnicas.",
  targetAudience: "Devs sênior e tech leads",
  weight: 1.5,
  isActive: true,
};

export const contentPillar: c.ContentPillar = {
  ...contentPillarInput,
  id: ids.pillar,
  createdAt: AT,
  updatedAt: AT,
};

export const sourceInput: c.SourceInput = {
  type: "RSS",
  name: "Prisma blog",
  url: "https://www.prisma.io/blog/rss.xml",
  trustLevel: "HIGH",
  pillarHints: [ids.pillar],
  fetchIntervalMinutes: 120,
};

export const source: c.Source = {
  ...sourceInput,
  id: ids.source,
  isActive: true,
  lastFetchedAt: AT,
  lastStatus: "OK",
  lastError: null,
  createdAt: AT,
  updatedAt: AT,
};

export const sourceItem: c.SourceItem = {
  id: ids.sourceItem,
  sourceId: ids.source,
  externalId: "https://www.prisma.io/blog/prisma-7",
  canonicalUrl: "https://www.prisma.io/blog/prisma-7",
  title: "Prisma 7 is here",
  author: "Prisma team",
  contentText: "Prisma 7 changes how migrations are generated.",
  contentHash: SHA256,
  language: "en",
  publishedAt: AT,
  fetchedAt: AT,
  untrusted: true,
};

export const sourceItemSummary: c.SourceItemSummary = {
  id: ids.sourceItem,
  sourceId: ids.source,
  canonicalUrl: sourceItem.canonicalUrl,
  title: sourceItem.title,
  author: sourceItem.author,
  publishedAt: AT,
  untrusted: true,
};

export const watchlistInput: c.WatchlistInput = {
  name: "Prisma",
  keywords: ["prisma", "migrations"],
  pillarId: ids.pillar,
  sourceIds: [],
};
export const watchlist: c.Watchlist = {
  ...watchlistInput,
  id: ids.watchlist,
  isActive: true,
  createdAt: AT,
  updatedAt: AT,
};

export const scoreBreakdown: c.ScoreBreakdown = {
  recency: 0.9,
  pillarFit: 0.8,
  audienceFit: 0.9,
  novelty: 0.7,
  sourceTrust: 0.8,
  voiceFit: 0.6,
  risk: 0.1,
};

/** Briefing §13 contract, verbatim field names. */
export const opportunityMinimal: c.Opportunity = {
  id: ids.opportunity,
  title: "Prisma 7 muda o modelo de migrations",
  summary: "O Prisma 7 passa a gerar SQL revisável por padrão.",
  sourceIds: [ids.sourceItem],
  publishedAt: AT,
  contentPillar: "engenharia",
  targetAudience: "Devs backend",
  relevanceReason: "Rodrigo opera Prisma em produção.",
  suggestedAngle: "O que muda na revisão de SQL antes do deploy.",
  suggestedFormat: "code-card",
  score: 87.5,
  status: "candidate",
};

export const opportunity: c.Opportunity = {
  ...opportunityMinimal,
  rank: 1,
  curationRunId: ids.run,
  origin: "CURATION",
  scoreBreakdown,
  expiresAt: LATER,
  draftId: null,
};

export const opportunityDetail: c.OpportunityDetail = {
  ...opportunity,
  sourceItems: [sourceItemSummary],
};

/** Five distinct cards ranked 1..5 (invariant I1). */
export const fiveOpportunities: c.Opportunity[] = Array.from({ length: 5 }, (_, index) => ({
  ...opportunity,
  id: `018f6b1e-7c2a-7b3c-9d4e-00000000010${index + 1}`,
  rank: index + 1,
  title: `${opportunity.title} #${index + 1}`,
}));

export const opportunityBatch: c.OpportunityBatch = {
  curationRunId: ids.run,
  status: "SUCCEEDED",
  generatedAt: AT,
  opportunities: fiveOpportunities,
};

export const manualOpportunityInput: c.ManualOpportunityInput = {
  title: "Por que paramos de usar feature flags em tudo",
  contentPillar: "engenharia",
  sourceUrls: ["https://martinfowler.com/articles/feature-toggles.html"],
};

export const curationRunStats: c.CurationRunStats = {
  sourcesFetched: 4,
  itemsNew: 37,
  itemsDeduped: 9,
  candidatesScored: 28,
  injectionSuspected: 0,
};

export const curationRun: c.CurationRun = {
  id: ids.run,
  scheduledFor: AT,
  timezone: TZ,
  trigger: "CRON",
  status: "SUCCEEDED",
  startedAt: AT,
  finishedAt: AT,
  stats: curationRunStats,
  engineVersion: "0.3.0",
  promptId: "opportunity-classify",
  promptVersion: "1.0.0",
  model: "gpt-5",
  error: null,
  jobId: "job-1",
  createdAt: AT,
};

export const curationRunDetail: c.CurationRunDetail = {
  ...curationRun,
  opportunities: fiveOpportunities,
};

export const partialCurationRunDetail: c.CurationRunDetail = {
  ...curationRun,
  status: "PARTIAL",
  opportunities: fiveOpportunities.slice(0, 2),
};

export const hook: c.Hook = {
  text: "Três incidentes em um ano me ensinaram a ler SQL de migration.",
  formula: "H07",
  rationale: "Número concreto do Story Bank.",
};

export const draftMediaSuggestion: c.DraftMediaSuggestion = {
  format: "code-card",
  description: "Card com o SQL gerado pela migration.",
  altText: "Trecho de SQL com ALTER TABLE posts ADD COLUMN slug text.",
  codeSnippet: "ALTER TABLE posts ADD COLUMN slug text;",
};

export const citation: c.Citation = {
  sourceItemId: ids.sourceItem,
  url: null,
  claim: "Prisma 7 gera SQL revisável por padrão",
  quote: "migrations are generated as reviewable SQL",
};

export const generationMetadata: c.GenerationMetadata = {
  promptId: "draft-writer",
  promptVersion: "1.2.0",
  model: "gpt-5",
  engineVersion: "0.3.0",
  usage: { inputTokens: 1200, outputTokens: 600, costUsd: 0.01 },
  latencyMs: 4200,
  requestId: "req_abc",
};

export const draftEval: c.DraftEval = {
  clicheScore: 0.1,
  voiceMatch: 0.9,
  unsupportedClaims: [],
  injectionSuspected: false,
  quality: qualityEvaluation,
};

export const draftVersion: c.DraftVersion = {
  id: ids.version,
  draftId: ids.draft,
  versionNumber: 1,
  parentVersionId: null,
  authorType: "SYSTEM",
  body: "Três incidentes em um ano me ensinaram a ler SQL de migration antes do deploy.\n\n#prisma",
  hooks: [hook],
  mediaSuggestion: draftMediaSuggestion,
  citations: [citation],
  storyEntryIds: [ids.story],
  mediaAssetIds: [],
  generation: generationMetadata,
  eval: draftEval,
  createdAt: AT,
};

export const userDraftVersion: c.DraftVersion = {
  ...draftVersion,
  id: ids.version2,
  versionNumber: 2,
  parentVersionId: ids.version,
  authorType: "USER",
  generation: null,
  eval: null,
};

export const draftVersionSummary: c.DraftVersionSummary = {
  id: ids.version,
  draftId: ids.draft,
  versionNumber: 1,
  authorType: "SYSTEM",
  bodyExcerpt: "Três incidentes em um ano…",
  createdAt: AT,
};

export const schedule: c.Schedule = {
  id: ids.schedule,
  draftId: ids.draft,
  draftVersionId: ids.version,
  scheduledAt: LATER,
  timezone: TZ,
  requestedLocalTime: "2026-10-15T09:00",
  status: "PENDING",
  jobId: "job-2",
  createdByType: "USER",
  cancelledAt: null,
  cancelReason: null,
  createdAt: AT,
};

export const publication: c.Publication = {
  id: ids.publication,
  draftId: ids.draft,
  draftVersionId: ids.version,
  scheduleId: ids.schedule,
  status: "SUCCEEDED",
  attempt: 1,
  externalPostId: "urn:li:share:123",
  externalUrl: "https://www.linkedin.com/feed/update/urn:li:share:123",
  startedAt: LATER,
  finishedAt: LATER,
  publishedAt: LATER,
  error: null,
  createdAt: AT,
};

export const publicationError: c.PublicationError = {
  code: "LINKEDIN_401",
  httpStatus: 401,
  message: "Unauthorized",
};

export const draft: c.Draft = {
  id: ids.draft,
  opportunityId: ids.opportunity,
  status: "IN_REVIEW",
  language: "pt-BR",
  rowVersion: 4,
  currentVersion: draftVersion,
  approvedVersion: null,
  schedule: null,
  lastPublication: null,
  failureReason: null,
  needsReconciliation: false,
  isPrefetch: false,
  proposedSlot: { localDateTime: "2026-10-15T09:00", timezone: TZ },
  discardedAt: null,
  discardReason: null,
  createdAt: AT,
  updatedAt: AT,
};

export const draftListItem: c.DraftListItem = {
  id: draft.id,
  opportunityId: draft.opportunityId,
  status: draft.status,
  language: draft.language,
  rowVersion: draft.rowVersion,
  failureReason: null,
  needsReconciliation: false,
  isPrefetch: false,
  proposedSlot: null,
  discardedAt: null,
  discardReason: null,
  createdAt: AT,
  updatedAt: AT,
  currentVersion: draftVersionSummary,
  approvedVersionId: null,
  scheduledAt: null,
};

export const approvalByUser: c.Approval = {
  id: ids.approval,
  draftId: ids.draft,
  draftVersionId: ids.version,
  decision: "APPROVED",
  actorType: "USER",
  actorUserId: ids.user,
  autonomyMode: "ASSISTED",
  reason: null,
  policySnapshot: null,
  createdAt: AT,
};

export const approvalBySystem: c.Approval = {
  ...approvalByUser,
  actorType: "SYSTEM",
  actorUserId: null,
  autonomyMode: "AUTOPILOT_CONTROLLED",
  reason: "score 91 ≥ 85; pillar 'engenharia' allowed; weekly cap 2/3",
  policySnapshot: autopilotSettings,
};

export const codeCardRenderSpec: c.CodeCardRenderSpec = {
  language: "typescript",
  code: "const a = 1;",
  title: "Exemplo",
};

export const mediaAsset: c.MediaAsset = {
  id: ids.media,
  origin: "RENDERED",
  kind: "CODE_CARD",
  mimeType: "image/png",
  bytes: 120_000,
  sha256: SHA256,
  width: 1200,
  height: 1200,
  renderSpec: codeCardRenderSpec,
  linkedinAssetUrn: null,
  linkedinUploadStatus: "NONE",
  status: "READY",
  signedUrl: "https://storage.example.com/media/abc?sig=xyz",
  signedUrlExpiresAt: LATER,
  createdAt: AT,
};

export const notificationPayload: c.NotificationPayload = {
  title: "Curadoria pronta",
  message: "5 oportunidades aguardam você.",
  entityType: "CurationRun",
  entityId: ids.run,
};

export const notification: c.Notification = {
  id: ids.notification,
  channel: "IN_APP",
  kind: "CURATION_READY",
  payload: notificationPayload,
  dedupeKey: `curation-ready:${ids.run}`,
  status: "SENT",
  sentAt: AT,
  readAt: null,
  error: null,
  createdAt: AT,
};

export const auditEvent: c.AuditEvent = {
  id: ids.audit,
  actorType: "USER",
  actorId: ids.user,
  action: "draft.approve",
  entityType: "Draft",
  entityId: ids.draft,
  before: { status: "IN_REVIEW" },
  after: { status: "APPROVED" },
  correlationId: "req_01J",
  ip: "203.0.113.7",
  userAgent: "Mozilla/5.0",
  createdAt: AT,
};

export const problemDetails: c.ProblemDetails = {
  type: "https://linkedin-ops.local/errors/draft-invalid-transition",
  title: "Transição de estado inválida",
  status: 409,
  detail: "Draft em IN_REVIEW não aceita 'schedule'",
  instance: "/api/v1/drafts/7f/schedule",
  code: "DRAFT_INVALID_TRANSITION",
  correlationId: "req_01J",
};

export const resourceCases: SchemaCase[] = [
  // common
  {
    name: "ProblemDetails",
    schema: c.ProblemDetailsSchema,
    valid: problemDetails,
    invalid: {
      "unknown code": set("code", "SOMETHING_ELSE"),
      "status 99": set("status", 99),
      "missing correlationId": drop("correlationId"),
      "status does not match code": set("status", 200),
      "type does not match code": set("type", "https://linkedin-ops.local/errors/not-found"),
      "errors[] on a non-validation code": set("errors", [{ path: ["x"], message: "y" }]),
      "NOT_FOUND served as 409": (v) =>
        patch(patch(v, "code", "NOT_FOUND"), "type", "https://linkedin-ops.local/errors/not-found"),
    },
  },
  {
    name: "ProblemDetails (400 with errors)",
    schema: c.ProblemDetailsSchema,
    valid: {
      ...problemDetails,
      type: "https://linkedin-ops.local/errors/validation-failed",
      status: 400,
      code: "VALIDATION_FAILED",
      errors: [{ path: ["timezone"], message: "IANA timezone obrigatório" }],
    },
    invalid: {
      "issue without message": drop("errors.0.message"),
      "path with object": set("errors.0.path", [{}]),
    },
  },
  {
    name: "AsyncAccepted",
    schema: c.AsyncAcceptedSchema,
    valid: { id: ids.draft, status: "GENERATING", jobId: "job-1" },
    invalid: { "empty jobId": set("jobId", ""), "non-uuid id": set("id", "draft-1") },
  },
  {
    name: "ClassifiedError",
    schema: c.ClassifiedErrorSchema,
    valid: { code: "OPENAI_TIMEOUT", message: "Timed out after 60s", retryable: true },
    invalid: { "retryable as string": set("retryable", "yes"), "empty code": set("code", "") },
  },
  {
    name: "LocalSlot",
    schema: c.LocalSlotSchema,
    valid: { localDateTime: "2026-10-15T09:00", timezone: TZ },
    invalid: {
      "seconds in local time": set("localDateTime", "2026-10-15T09:00:00"),
      "offset instead of timezone": set("timezone", "-03:00"),
      "impossible date": set("localDateTime", "2026-02-30T09:00"),
    },
  },
  {
    name: "RequestedBy",
    schema: c.RequestedBySchema,
    valid: { type: "SYSTEM", id: "cron" },
    invalid: { "WORKER not allowed": set("type", "WORKER"), "empty id": set("id", "") },
  },
  {
    name: "PaginationQuery",
    schema: c.PaginationQuerySchema,
    valid: { limit: "20", cursor: "abc" },
    invalid: {
      "limit 0": set("limit", "0"),
      "limit over max": set("limit", "101"),
      "empty cursor": set("cursor", ""),
    },
  },
  // health
  {
    name: "HealthStatus",
    schema: c.HealthStatusSchema,
    valid: { status: "ok", version: "0.1.0", uptimeSeconds: 10 },
    invalid: { "status down": set("status", "down"), "negative uptime": set("uptimeSeconds", -1) },
  },
  {
    name: "ReadinessStatus",
    schema: c.ReadinessStatusSchema,
    valid: { status: "degraded", checks: { database: "ok", queue: "failed" } },
    invalid: {
      "unknown check": set("checks.database", "meh"),
      "missing queue": drop("checks.queue"),
    },
  },
  // identity
  {
    name: "User",
    schema: c.UserSchema,
    valid: user,
    invalid: {
      "bad email": set("email", "nope"),
      "unknown timezone": set("timezone", "Mars/Olympus"),
      "bad urn": set("linkedinMemberUrn", "person:abc"),
    },
  },
  {
    name: "LoginInput",
    schema: c.LoginInputSchema,
    valid: { email: user.email, password: "correct-horse-battery" },
    invalid: {
      "short password": set("password", "short"),
      "14-char password": set("password", "abcdefghijklmn"),
      "missing email": drop("email"),
      "extra key stripped? no, rejected": set("accessToken", "x"),
    },
  },
  {
    name: "ReauthInput",
    schema: c.ReauthInputSchema,
    valid: { password: "correct-horse-battery" },
    invalid: {
      "empty password": set("password", ""),
      "numeric password": set("password", 12345678901234),
    },
  },
  {
    name: "Me",
    schema: c.MeSchema,
    valid: me,
    invalid: {
      "missing csrfToken": drop("csrfToken"),
      "short csrfToken": set("csrfToken", "abc"),
      "elevatedUntil with offset": set("elevatedUntil", "2026-10-13T12:00:00+00:00"),
      "unknown role": set("role", "ADMIN"),
      "linkedinConnected as string": set("linkedinConnected", "yes"),
    },
  },
  {
    name: "SessionSummary",
    schema: c.SessionSummarySchema,
    valid: sessionSummary,
    invalid: {
      "opaque id": set("id", "abc"),
      "offset datetime": set("createdAt", "2026-10-13T12:00:00+00:00"),
    },
  },
  {
    name: "Me (elevated)",
    schema: c.MeSchema,
    valid: { ...me, elevatedUntil: LATER },
    invalid: {
      "elevatedUntil as number": set("elevatedUntil", 1),
      "missing elevatedUntil": drop("elevatedUntil"),
    },
  },
  {
    name: "LoginResponse",
    schema: c.LoginResponseSchema,
    valid: { csrfToken: CSRF, elevatedUntil: null },
    invalid: {
      "elevated right after login": set("elevatedUntil", LATER),
      "missing csrfToken": drop("csrfToken"),
      "short csrfToken": set("csrfToken", "x"),
    },
  },
  {
    name: "ReauthResponse",
    schema: c.ReauthResponseSchema,
    valid: { csrfToken: CSRF, elevatedUntil: LATER },
    invalid: {
      "elevatedUntil null": set("elevatedUntil", null),
      "missing csrfToken": drop("csrfToken"),
      "bad datetime": set("elevatedUntil", "soon"),
    },
  },
  // integrations
  {
    name: "LinkedInIntegration",
    schema: c.LinkedInIntegrationSchema,
    valid: linkedInIntegration,
    invalid: { "unknown status": set("status", "CONNECTED"), "bad urn": set("memberUrn", "abc") },
  },
  {
    name: "LinkedInConnectResponse",
    schema: c.LinkedInConnectResponseSchema,
    valid: { authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization?x=1" },
    invalid: {
      "http url": set("authorizeUrl", "http://www.linkedin.com/x"),
      missing: drop("authorizeUrl"),
    },
  },
  {
    name: "LinkedInCallbackQuery",
    schema: c.LinkedInCallbackQuerySchema,
    valid: { state: "s", code: "c" },
    invalid: {
      "neither code nor error": drop("code"),
      "both code and error": set("error", "access_denied"),
      "empty error": (v) => patch(patch(v, "code", DELETE), "error", ""),
      "missing state": drop("state"),
      "unknown param": set("access_token", "x"),
    },
  },
  {
    name: "LinkedInCallbackQuery (error only)",
    schema: c.LinkedInCallbackQuerySchema,
    valid: { state: "s", error: "access_denied", error_description: "User denied" },
    invalid: { "code added": set("code", "c"), "missing state": drop("state") },
  },
  // settings
  {
    name: "AutonomySettingsInput",
    schema: c.AutonomySettingsInputSchema,
    valid: autonomySettingsInput,
    invalid: {
      "autopilot without min score": set("mode", "AUTOPILOT_CONTROLLED"),
      "quiet hours 25:00": set("quietHours.start", "25:00"),
      "negative weekly cap": set("maxAutoPostsPerWeek", -1),
      "score over 100": set("autoApproveMinScore", 101),
      "cancel window below 5": set("cancelWindowMinutes", 0),
    },
  },
  {
    name: "AutonomySettings",
    schema: c.AutonomySettingsSchema,
    valid: autopilotSettings,
    invalid: { "missing updatedAt": drop("updatedAt"), "unknown mode": set("mode", "MANUAL") },
  },
  {
    name: "AutonomySettingsUpdateResponse",
    schema: c.AutonomySettingsUpdateResponseSchema,
    valid: { settings: autonomySettings, revokedDraftIds: [ids.draft] },
    invalid: {
      "bad draft id": set("revokedDraftIds", ["x"]),
      "settings null": set("settings", null),
    },
  },
  {
    name: "NotificationSettings",
    schema: c.NotificationSettingsSchema,
    valid: notificationSettings,
    invalid: {
      "enabled as string": set("telegram.enabled", "yes"),
      "missing inApp": drop("inApp"),
    },
  },
  {
    name: "NotificationSettingsInput",
    schema: c.NotificationSettingsInputSchema,
    valid: { telegram: { enabled: false }, inApp: { enabled: true } },
    invalid: { "missing telegram": drop("telegram"), "enabled as number": set("inApp.enabled", 1) },
  },
  // editorial memory
  {
    name: "VoiceProfileInput",
    schema: c.VoiceProfileInputSchema,
    valid: voiceProfileInput,
    invalid: {
      "unknown language": set("language", "es"),
      "empty tone": set("tone", ""),
      "example too long": set("examples.0.text", repeat("a", 3001)),
    },
  },
  {
    name: "VoiceProfile",
    schema: c.VoiceProfileSchema,
    valid: voiceProfile,
    invalid: { "version 0": set("version", 0), "isActive as string": set("isActive", "true") },
  },
  {
    name: "StoryBankEntryInput",
    schema: c.StoryBankEntryInputSchema,
    valid: storyBankEntryInput,
    invalid: {
      "empty title": set("title", ""),
      "ftp source url": set("facts.0.sourceUrl", "ftp://x.y/z"),
      "tags too many": set(
        "tags",
        Array.from({ length: 21 }, (_, i) => `t${i}`),
      ),
    },
  },
  {
    name: "StoryBankEntryPatch",
    schema: c.StoryBankEntryPatchSchema,
    valid: { title: "Novo título", status: "ARCHIVED" },
    invalid: {
      "unknown status": set("status", "DELETED"),
      "empty narrative": set("narrative", ""),
    },
  },
  {
    name: "StoryBankEntry",
    schema: c.StoryBankEntrySchema,
    valid: storyBankEntry,
    invalid: {
      "negative usage": set("usageCount", -1),
      "unknown status": set("status", "PENDING"),
    },
  },
  {
    name: "ContentPillarInput",
    schema: c.ContentPillarInputSchema,
    valid: contentPillarInput,
    invalid: { "uppercase slug": set("slug", "Engenharia"), "weight over 10": set("weight", 11) },
  },
  {
    name: "ContentPillarPatch",
    schema: c.ContentPillarPatchSchema,
    valid: { name: "Novo nome" },
    invalid: {
      "slug with space": set("slug", "eng soft"),
      "isActive as string": set("isActive", "no"),
    },
  },
  {
    name: "ContentPillar",
    schema: c.ContentPillarSchema,
    valid: contentPillar,
    invalid: { "missing id": drop("id"), "bad createdAt": set("createdAt", "yesterday") },
  },
  // sources
  {
    name: "SourceInput",
    schema: c.SourceInputSchema,
    valid: sourceInput,
    invalid: {
      "http url": set("url", "http://www.prisma.io/blog/rss.xml"),
      "interval below 60": set("fetchIntervalMinutes", 30),
      "unknown type": set("type", "SCRAPER"),
    },
  },
  {
    name: "SourcePatch",
    schema: c.SourcePatchSchema,
    valid: { isActive: false },
    invalid: {
      "unknown trust": set("trustLevel", "ULTRA"),
      "interval below 60": set("fetchIntervalMinutes", 10),
    },
  },
  {
    name: "Source",
    schema: c.SourceSchema,
    valid: source,
    invalid: {
      "unknown lastStatus": set("lastStatus", "TIMEOUT"),
      "missing isActive": drop("isActive"),
    },
  },
  {
    name: "SourceItem",
    schema: c.SourceItemSchema,
    valid: sourceItem,
    invalid: {
      "untrusted false": set("untrusted", false),
      "bad hash": set("contentHash", "abc"),
      "content too long": set("contentText", repeat("x", c.SOURCE_ITEM_MAX_CONTENT_CHARS + 1)),
    },
  },
  {
    name: "SourceItemSummary",
    schema: c.SourceItemSummarySchema,
    valid: sourceItemSummary,
    invalid: {
      "untrusted false": set("untrusted", false),
      "bad url": set("canonicalUrl", "not a url"),
    },
  },
  {
    name: "WatchlistInput",
    schema: c.WatchlistInputSchema,
    valid: watchlistInput,
    invalid: { "no keywords": set("keywords", []), "empty name": set("name", "") },
  },
  {
    name: "WatchlistPatch",
    schema: c.WatchlistPatchSchema,
    valid: { keywords: ["prisma"] },
    invalid: { "empty keyword": set("keywords", [""]), "pillarId number": set("pillarId", 1) },
  },
  {
    name: "Watchlist",
    schema: c.WatchlistSchema,
    valid: watchlist,
    invalid: { "missing isActive": drop("isActive"), "empty keyword": set("keywords", [""]) },
  },
  // curation
  {
    name: "CurationRunStats",
    schema: c.CurationRunStatsSchema,
    valid: curationRunStats,
    invalid: {
      "negative count": set("itemsNew", -1),
      "missing injectionSuspected": drop("injectionSuspected"),
    },
  },
  {
    name: "CurationRun",
    schema: c.CurationRunSchema,
    valid: curationRun,
    invalid: {
      "unknown status": set("status", "DONE"),
      "timezone abbreviation": set("timezone", "BRT"),
      "bad engineVersion": set("engineVersion", "latest"),
    },
  },
  {
    name: "CurationRunDetail (SUCCEEDED, I1)",
    schema: c.CurationRunDetailSchema,
    valid: curationRunDetail,
    invalid: {
      "six opportunities": set("opportunities", Array(6).fill(opportunity)),
      "opportunities not array": set("opportunities", opportunity),
      "SUCCEEDED with one opportunity": set("opportunities", [opportunity]),
      "SUCCEEDED with four opportunities": set("opportunities", fiveOpportunities.slice(0, 4)),
      "five ranks all 1": set(
        "opportunities",
        fiveOpportunities.map((o) => ({ ...o, rank: 1 })),
      ),
      "ranks 1..4 plus 6": set("opportunities.4.rank", 6),
      "rank missing": set("opportunities.2.rank", null),
      "duplicate id": set("opportunities.1.id", fiveOpportunities[0]?.id),
    },
  },
  {
    name: "CurationRunDetail (PARTIAL)",
    schema: c.CurationRunDetailSchema,
    valid: partialCurationRunDetail,
    invalid: {
      "duplicate ranks even when PARTIAL": set("opportunities.1.rank", 1),
      "duplicate ids even when PARTIAL": set("opportunities.1.id", fiveOpportunities[0]?.id),
    },
  },
  // opportunities (briefing §13)
  {
    name: "Opportunity (briefing §13 minimal)",
    schema: c.OpportunitySchema,
    valid: opportunityMinimal,
    invalid: {
      "uppercase status": set("status", "CANDIDATE"),
      "score over 100": set("score", 101),
      "unknown format": set("suggestedFormat", "video"),
      "missing relevanceReason": drop("relevanceReason"),
    },
  },
  {
    name: "Opportunity (with internals)",
    schema: c.OpportunitySchema,
    valid: opportunity,
    invalid: {
      "rank 6": set("rank", 6),
      "breakdown missing risk": drop("scoreBreakdown.risk"),
      "breakdown voiceFit over 1": set("scoreBreakdown.voiceFit", 1.1),
    },
  },
  {
    name: "OpportunityDetail",
    schema: c.OpportunityDetailSchema,
    valid: opportunityDetail,
    invalid: {
      "missing sourceItems": drop("sourceItems"),
      "trusted source item": set("sourceItems.0.untrusted", false),
    },
  },
  {
    name: "OpportunityBatch",
    schema: c.OpportunityBatchSchema,
    valid: opportunityBatch,
    invalid: {
      "six opportunities": set("opportunities", Array(6).fill(opportunity)),
      "bad run id": set("curationRunId", "run-1"),
      "missing status": drop("status"),
      "SUCCEEDED with one opportunity": set("opportunities", [opportunity]),
      "five ranks all 1": set(
        "opportunities",
        fiveOpportunities.map((o) => ({ ...o, rank: 1 })),
      ),
    },
  },
  {
    name: "OpportunityBatch (PARTIAL with two cards)",
    schema: c.OpportunityBatchSchema,
    valid: { ...opportunityBatch, status: "PARTIAL", opportunities: fiveOpportunities.slice(0, 2) },
    invalid: {
      "duplicate rank": set("opportunities.1.rank", 1),
      "unknown status": set("status", "DONE"),
    },
  },
  {
    name: "OpportunityDismissInput",
    schema: c.OpportunityDismissInputSchema,
    valid: {},
    invalid: {
      "reason too long": set("reason", repeat("r", 501)),
      "reason number": set("reason", 123),
    },
  },
  {
    name: "OpportunitySelectAccepted",
    schema: c.OpportunitySelectAcceptedSchema,
    valid: { id: ids.draft, status: "GENERATING", jobId: "job-1", draftId: ids.draft },
    invalid: {
      "empty jobId": set("jobId", ""),
      "missing draftId": drop("draftId"),
      "missing base id": drop("id"),
    },
  },
  {
    name: "OpportunitySelectAdopted",
    schema: c.OpportunitySelectAdoptedSchema,
    valid: { draftId: ids.draft },
    invalid: { "bad draftId": set("draftId", "x"), "empty object": replace({}) },
  },
  {
    name: "ManualOpportunityInput",
    schema: c.ManualOpportunityInputSchema,
    valid: manualOpportunityInput,
    invalid: {
      "http source url": set("sourceUrls", ["http://example.com"]),
      "pillar not slug": set("contentPillar", "Eng Soft"),
      "empty title": set("title", ""),
    },
  },
  {
    name: "ManualOpportunityAccepted",
    schema: c.ManualOpportunityAcceptedSchema,
    valid: {
      id: ids.opportunity,
      status: "selected",
      jobId: "job-1",
      opportunityId: ids.opportunity,
      draftId: ids.draft,
    },
    invalid: {
      "missing jobId": drop("jobId"),
      "opportunityId number": set("opportunityId", 1),
      "missing status": drop("status"),
    },
  },
  // drafts
  {
    name: "Hook",
    schema: c.HookSchema,
    valid: hook,
    invalid: {
      "text over 210": set("text", repeat("h", 211)),
      "unknown formula": set("formula", "H99"),
      "missing rationale": drop("rationale"),
    },
  },
  {
    name: "DraftMediaSuggestion",
    schema: c.DraftMediaSuggestionSchema,
    valid: draftMediaSuggestion,
    invalid: {
      "missing altText": drop("altText"),
      "altText over 300": set("altText", repeat("a", 301)),
      "format text": set("format", "text"),
    },
  },
  {
    name: "Citation",
    schema: c.CitationSchema,
    valid: citation,
    invalid: {
      "no source at all": set("url", null) && set("sourceItemId", null),
      "empty claim": set("claim", ""),
    },
  },
  {
    name: "Citation (url only)",
    schema: c.CitationSchema,
    valid: { sourceItemId: null, url: "https://example.com/post", claim: "x", quote: null },
    invalid: { "both null": set("url", null), "bad url": set("url", "nope") },
  },
  {
    name: "GenerationMetadata",
    schema: c.GenerationMetadataSchema,
    valid: generationMetadata,
    invalid: {
      "promptId with version": set("promptId", "draft@v1"),
      "promptVersion not semver": set("promptVersion", "v1"),
      "negative tokens": set("usage.inputTokens", -1),
    },
  },
  {
    name: "DraftEval",
    schema: c.DraftEvalSchema,
    valid: draftEval,
    invalid: {
      "clicheScore over 1": set("clicheScore", 2),
      "unsupportedClaims string": set("unsupportedClaims", "none"),
      "quality invalid": set("quality.verdict", "ok"),
    },
  },
  {
    name: "DraftVersion (SYSTEM)",
    schema: c.DraftVersionSchema,
    valid: draftVersion,
    invalid: {
      "body over 3000": set("body", repeat("x", c.POST_BODY_MAX_CHARS + 1)),
      "versionNumber 0": set("versionNumber", 0),
      "unknown author": set("authorType", "BOT"),
    },
  },
  {
    name: "DraftVersion (USER)",
    schema: c.DraftVersionSchema,
    valid: userDraftVersion,
    invalid: {
      "USER with generation": set("generation", generationMetadata),
      "media without altText": drop("mediaSuggestion.altText"),
    },
  },
  {
    name: "DraftVersionSummary",
    schema: c.DraftVersionSummarySchema,
    valid: draftVersionSummary,
    invalid: {
      "excerpt over 280": set("bodyExcerpt", repeat("e", 281)),
      "versionNumber 0": set("versionNumber", 0),
    },
  },
  {
    name: "DraftVersionCreateInput",
    schema: c.DraftVersionCreateInputSchema,
    valid: {
      body: draftVersion.body,
      hooks: [hook],
      mediaSuggestion: null,
      citations: [citation],
      expectedRowVersion: 3,
    },
    invalid: {
      "missing expectedRowVersion": drop("expectedRowVersion"),
      "empty body": set("body", ""),
    },
  },
  {
    name: "Draft",
    schema: c.DraftSchema,
    valid: draft,
    invalid: {
      "unknown status": set("status", "WRITING"),
      "negative rowVersion": set("rowVersion", -1),
      "proposedSlot with seconds": set("proposedSlot.localDateTime", "2026-10-15T09:00:00"),
    },
  },
  {
    name: "DraftListItem",
    schema: c.DraftListItemSchema,
    valid: draftListItem,
    invalid: {
      "full version instead of summary": set("currentVersion", draftVersion),
      "missing scheduledAt": drop("scheduledAt"),
    },
  },
  {
    name: "DraftRegenerateInput",
    schema: c.DraftRegenerateInputSchema,
    valid: { expectedRowVersion: 1, instructions: "Mais curto", keepHooks: true },
    invalid: {
      "instructions too long": set("instructions", repeat("i", 2001)),
      "rowVersion string": set("expectedRowVersion", "1"),
    },
  },
  {
    name: "DraftSubmitReviewInput",
    schema: c.DraftSubmitReviewInputSchema,
    valid: { expectedRowVersion: 1 },
    invalid: { empty: replace({}), "negative rowVersion": set("expectedRowVersion", -1) },
  },
  {
    name: "DraftApproveInput",
    schema: c.DraftApproveInputSchema,
    valid: { versionId: ids.version, expectedRowVersion: 1 },
    invalid: {
      "missing versionId": drop("versionId"),
      "fractional rowVersion": set("expectedRowVersion", 1.5),
    },
  },
  {
    name: "DraftRejectInput",
    schema: c.DraftRejectInputSchema,
    valid: { versionId: ids.version, reason: "Hook fraco", expectedRowVersion: 1 },
    invalid: { "empty reason": set("reason", ""), "bad versionId": set("versionId", "v1") },
  },
  {
    name: "DraftScheduleInput",
    schema: c.DraftScheduleInputSchema,
    valid: {
      versionId: ids.version,
      localDateTime: "2026-10-15T09:00",
      timezone: TZ,
      expectedRowVersion: 2,
    },
    invalid: {
      "offset as timezone": set("timezone", "-03:00"),
      "UTC instant as local time": set("localDateTime", "2026-10-15T09:00:00Z"),
      "impossible date": set("localDateTime", "2026-02-30T09:00"),
      "missing timezone": drop("timezone"),
    },
  },
  {
    name: "DraftPublishInput",
    schema: c.DraftPublishInputSchema,
    valid: { versionId: ids.version, expectedRowVersion: 1 },
    invalid: {
      "missing versionId": drop("versionId"),
      "rowVersion string": set("expectedRowVersion", "1"),
    },
  },
  {
    name: "DraftRetryPublicationInput",
    schema: c.DraftRetryPublicationInputSchema,
    valid: { expectedRowVersion: 1 },
    invalid: { empty: replace({}), null: replace(null) },
  },
  {
    name: "DraftDiscardInput",
    schema: c.DraftDiscardInputSchema,
    valid: { expectedRowVersion: 1, reason: "Tema repetido" },
    invalid: {
      "reason too long": set("reason", repeat("r", 501)),
      "missing rowVersion": drop("expectedRowVersion"),
    },
  },
  {
    name: "PublishAccepted",
    schema: c.PublishAcceptedSchema,
    valid: {
      id: ids.publication,
      status: "PENDING",
      jobId: "job-3",
      publicationId: ids.publication,
    },
    invalid: {
      "bad publicationId": set("publicationId", "p"),
      "missing jobId": drop("jobId"),
      "missing base id": drop("id"),
    },
  },
  // approvals
  {
    name: "Approval (USER)",
    schema: c.ApprovalSchema,
    valid: approvalByUser,
    invalid: {
      "USER without actorUserId": set("actorUserId", null),
      "unknown decision": set("decision", "MAYBE"),
    },
  },
  {
    name: "Approval (SYSTEM)",
    schema: c.ApprovalSchema,
    valid: approvalBySystem,
    invalid: {
      "SYSTEM without reason": set("reason", null),
      "SYSTEM without policy snapshot": set("policySnapshot", null),
    },
  },
  // schedule & publication
  {
    name: "Schedule",
    schema: c.ScheduleSchema,
    valid: schedule,
    invalid: {
      "missing timezone": drop("timezone"),
      "requestedLocalTime with seconds": set("requestedLocalTime", "2026-10-15T09:00:00"),
      "unknown status": set("status", "DONE"),
    },
  },
  {
    name: "ScheduleListQuery",
    schema: c.ScheduleListQuerySchema,
    valid: { from: AT, to: LATER },
    invalid: { "from after to": set("from", "2026-10-16T00:00:00Z"), "missing to": drop("to") },
  },
  {
    name: "PublicationError",
    schema: c.PublicationErrorSchema,
    valid: publicationError,
    invalid: { "httpStatus 99": set("httpStatus", 99), "empty code": set("code", "") },
  },
  {
    name: "Publication",
    schema: c.PublicationSchema,
    valid: publication,
    invalid: {
      "unknown status": set("status", "DONE"),
      "externalPostId not urn": set("externalPostId", "share:123"),
      "negative attempt": set("attempt", -1),
    },
  },
  // media
  {
    name: "CodeCardRenderSpec",
    schema: c.CodeCardRenderSpecSchema,
    valid: codeCardRenderSpec,
    invalid: {
      "empty language": set("language", ""),
      "code too long": set("code", repeat("c", 4001)),
    },
  },
  {
    name: "MediaRenderInput",
    schema: c.MediaRenderInputSchema,
    valid: { kind: "CODE_CARD", spec: codeCardRenderSpec },
    invalid: { "unknown kind": set("kind", "IMAGE"), "empty code": set("spec.code", "") },
  },
  {
    name: "MediaAsset",
    schema: c.MediaAssetSchema,
    valid: mediaAsset,
    invalid: {
      "bad sha256": set("sha256", "xyz"),
      "negative bytes": set("bytes", -1),
      "bad mime": set("mimeType", "png"),
    },
  },
  // notifications & audit
  {
    name: "NotificationPayload",
    schema: c.NotificationPayloadSchema,
    valid: notificationPayload,
    invalid: { "empty title": set("title", ""), "bad entityId": set("entityId", "x") },
  },
  {
    name: "Notification",
    schema: c.NotificationSchema,
    valid: notification,
    invalid: { "unknown kind": set("kind", "HELLO"), "unknown channel": set("channel", "EMAIL") },
  },
  {
    name: "AuditEvent",
    schema: c.AuditEventSchema,
    valid: auditEvent,
    invalid: {
      "action not dotted": set("action", "DraftApprove"),
      "unknown actor": set("actorType", "ROBOT"),
      "empty correlationId": set("correlationId", ""),
      "token in after": set("after", { status: "APPROVED", accessToken: "x" }),
      "nested refresh token": set("before", { a: { b: { refreshToken: "x" } } }),
      "secret inside array": set("after", { items: [{ clientSecret: "x" }] }),
      "password hash": set("before", { passwordHash: "x" }),
    },
  },
  // list queries
  {
    name: "StoryBankListQuery",
    schema: c.StoryBankListQuerySchema,
    valid: { limit: "10", pillarId: ids.pillar, status: "ACTIVE" },
    invalid: { "bad pillarId": set("pillarId", "x"), "unknown status": set("status", "GONE") },
  },
  {
    name: "OpportunityListQuery",
    schema: c.OpportunityListQuerySchema,
    valid: { runId: ids.run, status: "candidate", pillar: "engenharia" },
    invalid: {
      "uppercase status": set("status", "CANDIDATE"),
      "pillar not slug": set("pillar", "Eng"),
    },
  },
  {
    name: "DraftListQuery",
    schema: c.DraftListQuerySchema,
    valid: { status: "APPROVED", from: AT, to: LATER },
    invalid: {
      "unknown status": set("status", "X"),
      "from with offset": set("from", "2026-10-13T12:00:00+02:00"),
    },
  },
  {
    name: "AuditEventQuery",
    schema: c.AuditEventQuerySchema,
    valid: { entityType: "Draft", entityId: ids.draft },
    invalid: { "bad entityId": set("entityId", "d1"), "limit 0": set("limit", "0") },
  },
  {
    name: "SourceListQuery",
    schema: c.SourceListQuerySchema,
    valid: { type: "RSS", isActive: "true" },
    invalid: { "isActive maybe": set("isActive", "maybe"), "unknown type": set("type", "HTML") },
  },
];
