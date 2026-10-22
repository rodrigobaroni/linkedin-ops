# Contracts: REST API e `packages/contracts`

- Owner: Atlas (Principal Architect); implementação: Alicerce (api), Vitral (web), Pêndulo (jobs)
- Status: rascunho da Onda 1 (2026-10-13)
- Relacionados: `system-overview.md`, `data-model.md`, ADR-0007 (auth), ADR-0003 (idempotent publishing)

Este documento fixa **o que** as interfaces expõem. Detalhes de campo são derivados dos schemas Zod em
`packages/contracts`, que é a fonte de verdade; a OpenAPI é gerada a partir deles. Em caso de conflito
entre este documento e `packages/contracts`, o pacote vence e este documento deve ser atualizado.

---

## 1. Convenções gerais

| Tema                  | Regra                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base path             | `/api/v1` (servido pela `api` atrás do Caddy, mesma origem do `web`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Formato               | JSON UTF-8; `Content-Type: application/json` obrigatório em requisições com corpo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Ids                   | UUID (v7) como string                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Datas                 | ISO 8601 em UTC com sufixo `Z` nas respostas. Entradas de agendamento usam **`localDateTime` + `timezone` IANA** (nunca offset solto)                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Nomes                 | `camelCase` nos payloads; enums em `SCREAMING_SNAKE` (`ASSISTED`, `IN_REVIEW`), exceto os valores do contrato §13 do briefing, que são expostos em minúsculas (`candidate`, `code-card`) para fidelidade ao briefing                                                                                                                                                                                                                                                                                                                                                                   |
| Paginação             | cursor: `?limit=20&cursor=<opaque>` → `{ items: [...], nextCursor: string \| null }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Filtros               | query params simples (`?status=candidate&runId=`); sem DSL                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Ordenação             | fixa por recurso (documentada); `?sort=` só onde houver caso de uso                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Ações                 | verbos de domínio como sub-recursos `POST /drafts/{id}/approve` (não `PATCH status`) — mantém a state machine no domínio                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Assíncrono            | ações que enfileiram job respondem `202 Accepted` com `Location` do recurso. Corpo base `AsyncAccepted { id, status, jobId }` (`id` = recurso principal, `status` = estado atual); cada ação **estende** esse base com ids nomeados (`draftId`, `publicationId`, `opportunityId`) para o cliente ter um tipo comum e nomes explícitos                                                                                                                                                                                                                                                  |
| Concorrência          | recursos mutáveis expõem `rowVersion`; **todas** as mutações de `Draft` (incl. `submit-review`, `reject`, `discard`) exigem `expectedRowVersion` no corpo → `409 ROW_VERSION_MISMATCH` se divergir. `AutonomySettings` não tem `rowVersion` (o `PUT` substitui o documento inteiro)                                                                                                                                                                                                                                                                                                    |
| Validação             | inputs, queries e path params são `z.strictObject` (chave desconhecida → `400 VALIDATION_FAILED`); DTOs de resposta e dados lidos do banco usam `strip` (campos desconhecidos ignorados, compatibilidade aditiva). Envelope de job também strict                                                                                                                                                                                                                                                                                                                                       |
| Idempotência de ações | header `Idempotency-Key` (UUID) em `POST` de ação — opcional por padrão, obrigatório onde 🧾; a api guarda `(userId, rota, key, sha256 do corpo canônico)` por 24 h. Mesma key + mesmo corpo → devolve a **mesma** resposta (status, corpo e `Location`) sem reexecutar; mesma key + corpo diferente → `409 IDEMPOTENCY_KEY_CONFLICT`, sem efeito; key ausente onde obrigatória → `400 IDEMPOTENCY_KEY_REQUIRED`; chamadas simultâneas com a mesma key produzem um único registro/job (reserva da key na mesma transação do efeito). A key é escopada por usuário e rota, nunca global |
| Autenticação          | cookie de sessão `__Host-session` (ADR-0007). Sem Bearer tokens no MVP                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| CSRF                  | mutações exigem `Origin` igual a `APP_BASE_URL`, `Content-Type: application/json` **e** header `X-Requested-With: linkedin-ops` (ver `system-overview.md` §3.1). Endpoints 🔐 exigem ainda `X-CSRF-Token` ligado à sessão **e** sessão elevada (`/auth/reauth` nos últimos 15 min). Exceção declarada: rota cujo registry declara `requestContentType: "multipart/form-data"` (upload) aceita só esse tipo (`415 UNSUPPORTED_MEDIA_TYPE` para outro) e mantém `Origin`, `X-Requested-With` e sessão; multipart em qualquer outra rota → `403 CSRF_REJECTED` |
| Rate limit            | por sessão/IP em `/auth/*` e em ações que chamam serviços externos (`publish`, `regenerate`, `curation-runs`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Segredos              | nunca aparecem em resposta: tokens OAuth, chaves, `passwordHash`. DTOs não têm esses campos por construção                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

---

## 2. Recursos e verbos

Legenda: 🔒 = autenticado; ⚡ = assíncrono (202 + job); 🧾 = exige `Idempotency-Key`; 🔐 = alto risco: exige sessão elevada + `X-CSRF-Token` e role OWNER (ADR-0007, threat model TM-02/TM-22).

### 2.1 Saúde

| Verbo | Rota      | Descrição                                                                                                                                                                                                                                                                                                   |
| ----- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET   | `/health` | liveness (sem auth)                                                                                                                                                                                                                                                                                         |
| GET   | `/ready`  | readiness: DB + pg-boss (sem auth). `200 { status: "ok", checks }` quando nada falhou; `503 SERVICE_NOT_READY` (Problem, `detail` lista os checks) se algum check falhou. Um check `skipped` (dependência ainda não ligada, ex.: pg-boss antes de T-006) nunca conta como falha (decisão 2026-10-21, T-008) |

### 2.2 Auth e sessão

| Verbo  | Rota                     | Corpo / resposta                                                                                                                                                                                                         |
| ------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| POST   | `/auth/login`            | `{ email, password }` → `200 { csrfToken, elevatedUntil: null }` + cookie (ADR-0007 N2). Única mutação sem sessão; mantém Origin/JSON/`X-Requested-With` e rate limit (N4). Erros genéricos (`AUTH_INVALID_CREDENTIALS`) |
| POST   | `/auth/logout` 🔒        | `204`; revoga a sessão                                                                                                                                                                                                   |
| POST   | `/auth/logout-all` 🔒    | `204`; revoga todas as sessões do usuário                                                                                                                                                                                |
| POST   | `/auth/reauth` 🔒        | `{ password }` → `200 { csrfToken, elevatedUntil }`; **eleva** a sessão por 15 min e rotaciona o id (novo token no corpo e no header `X-CSRF-Token`). Exigido pelos endpoints 🔐 (ADR-0007 N2)                           |
| GET    | `/auth/me` 🔒            | `{ id, email, name, role, locale, timezone, linkedinConnected: boolean, csrfToken, elevatedUntil: string \| null }` — fonte do `X-CSRF-Token` após qualquer rotação de sessão (ADR-0007 N2)                              |
| GET    | `/auth/sessions` 🔒      | lista de sessões ativas (`id, createdAt, lastSeenAt, ip, userAgent, current`)                                                                                                                                            |
| DELETE | `/auth/sessions/{id}` 🔒 | revoga outra sessão                                                                                                                                                                                                      |

Bootstrap do primeiro usuário: **comando CLI** (`pnpm --filter api cli user:create`), não endpoint público.

### 2.3 Integração LinkedIn (OAuth)

| Verbo  | Rota                                   | Descrição                                                                                                                                                                     |
| ------ | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/integrations/linkedin` 🔒            | `{ status: "DISCONNECTED"\|"ACTIVE"\|"EXPIRED"\|"REAUTH_REQUIRED", scopes, accessExpiresAt, memberUrn }` — **nunca** o token                                                  |
| POST   | `/integrations/linkedin/connect` 🔒 🔐 | gera `state` (CSPRNG ≥ 256 bits, só o hash persistido, ligado à sessão, 10 min, uso único; um state ativo por sessão) e PKCE S256 quando o app suportar; → `{ authorizeUrl }` |
| GET    | `/auth/linkedin/callback`              | recebe `code`+`state`; troca por token no servidor; cifra e grava; redireciona para `APP_BASE_URL/publicar?linkedin=connected\|error&reason=<código>` (MVP-0) |
| DELETE | `/integrations/linkedin` 🔒 🔐         | revoga/remove token (`AuditEvent`)                                                                                                                                            |

### 2.4 Settings

| Verbo | Rota                         | Corpo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET   | `/settings/autonomy` 🔒      | `AutonomySettings`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| PUT   | `/settings/autonomy` 🔒 🔐   | `AutonomySettingsInput` (completo, inclui `assistedPrefetchDraft`; gera `AuditEvent` com before/after). **Descer de modo** revoga aprovações automáticas pendentes (drafts voltam a `IN_REVIEW`, schedules cancelados) e responde `200 { settings, revokedDraftIds[] }` + `Notification{AUTOPILOT_REVOKED}`. `mode = AUTOPILOT_FULL` só é aceito se a flag operacional `AUTOPILOT_FULL_ENABLED=true` (padrão false até fechar os gates G-01..G-06 do threat model); caso contrário `422 AUTONOMY_MODE_NOT_ENABLED` |
| GET   | `/settings/notifications` 🔒 | canais ativos (Telegram ligado/desligado; `chatId` nunca exposto inteiro)                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| PUT   | `/settings/notifications` 🔒 |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

### 2.5 Memória editorial

| Verbo            | Rota                         | Notas                                                                   |
| ---------------- | ---------------------------- | ----------------------------------------------------------------------- |
| GET              | `/voice-profile` 🔒          | versão ativa                                                            |
| GET              | `/voice-profile/versions` 🔒 | histórico                                                               |
| POST             | `/voice-profile/versions` 🔒 | cria nova versão e ativa (`VoiceProfileInput`)                          |
| GET/POST         | `/story-bank` 🔒             | lista (filtro `tag`, `pillarId`, `status`) / cria `StoryBankEntryInput` |
| GET/PATCH/DELETE | `/story-bank/{id}` 🔒        | `DELETE` = arquiva (soft)                                               |
| GET/POST         | `/content-pillars` 🔒        |                                                                         |
| GET/PATCH/DELETE | `/content-pillars/{id}` 🔒   | `DELETE` bloqueado se houver oportunidade/draft ativo (409)             |

### 2.6 Fontes e watchlists

| Verbo            | Rota                       | Notas                                                                                                                               |
| ---------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| GET/POST         | `/sources` 🔒              | `SourceInput { type, name, url, trustLevel, pillarHints[], fetchIntervalMinutes }`; URL validada (https, allowlist, sem IP privado) |
| GET/PATCH/DELETE | `/sources/{id}` 🔒         |                                                                                                                                     |
| POST             | `/sources/{id}/test` 🔒 ⚡ | enfileira `source.fetch` em modo dry-run; `GET /sources/{id}` mostra `lastStatus`                                                   |
| GET              | `/sources/{id}/items` 🔒   | `SourceItem` paginado (somente leitura; marcado `untrusted: true` no DTO)                                                           |
| GET/POST         | `/watchlists` 🔒           |                                                                                                                                     |
| GET/PATCH/DELETE | `/watchlists/{id}` 🔒      |                                                                                                                                     |

### 2.7 Curadoria e oportunidades

| Verbo | Rota                                  | Notas                                                                                                                                                                                                                                        |
| ----- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET   | `/curation-runs` 🔒                   | paginado, mais recente primeiro                                                                                                                                                                                                              |
| POST  | `/curation-runs` 🔒 ⚡ 🧾             | gatilho manual (`trigger = MANUAL`); 409 se já houver run `QUEUED/RUNNING`                                                                                                                                                                   |
| GET   | `/curation-runs/{id}` 🔒              | inclui `stats` e `opportunities[]` (5 cards)                                                                                                                                                                                                 |
| GET   | `/opportunities` 🔒                   | filtros `runId`, `status`, `pillar`; padrão: run mais recente                                                                                                                                                                                |
| GET   | `/opportunities/{id}` 🔒              | `Opportunity` (§3.1) + `sourceItems[]` resumidos                                                                                                                                                                                             |
| POST  | `/opportunities/{id}/select` 🔒 ⚡ 🧾 | cria `Draft{GENERATING}` e enfileira `draft.generate` → `202 { draftId, jobId }`. Se existir `Draft{isPrefetch}` desta oportunidade, **adota-o** (`200 { draftId }`, sem novo job); prefetch de outra oportunidade do mesmo run é descartado |
| POST  | `/opportunities/{id}/dismiss` 🔒      | `{ reason? }`                                                                                                                                                                                                                                |
| POST  | `/opportunities/manual` 🔒 ⚡ 🧾      | entrada manual de assunto `{ title, summary?, contentPillar, suggestedFormat?, sourceUrls[]? }` → cria opportunity `origin=MANUAL, status=selected` + draft `GENERATING`                                                                     |

### 2.8 Rascunhos

| Verbo | Rota                                         | Notas                                                                                                                                                      |
| ----- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET   | `/drafts` 🔒                                 | filtros `status`, `from`, `to`; inclui `currentVersion` resumida                                                                                           |
| GET   | `/drafts/{id}` 🔒                            | `Draft` + `currentVersion` + `approvedVersion` + `schedule` + `lastPublication`                                                                            |
| GET   | `/drafts/{id}/versions` 🔒                   | todas as `DraftVersion` (sem `generation.usage` para VIEWER)                                                                                               |
| GET   | `/drafts/{id}/versions/{versionId}` 🔒       |                                                                                                                                                            |
| POST  | `/drafts/{id}/versions` 🔒                   | **edição manual** → nova versão `author=USER`: `{ body, hooks: { text, formula?, rationale? }[], mediaSuggestion?, citations[], expectedRowVersion }`      |
| POST  | `/drafts/{id}/regenerate` 🔒 ⚡ 🧾           | `{ instructions?, keepHooks?, expectedRowVersion }` → job `draft.regenerate`                                                                               |
| POST  | `/drafts/{id}/submit-review` 🔒              |                                                                                                                                                            |
| POST  | `/drafts/{id}/approve` 🔒                    | `{ versionId, expectedRowVersion }` → cria `Approval{USER}`                                                                                                |
| POST  | `/drafts/{id}/reject` 🔒                     | `{ versionId, reason }`                                                                                                                                    |
| POST  | `/drafts/{id}/schedule` 🔒 🧾                | `{ versionId, localDateTime: "2026-10-15T09:00", timezone: "America/Sao_Paulo", expectedRowVersion }` → `201 Schedule`                                     |
| POST  | `/drafts/{id}/publish` 🔒 🔐 ⚡ 🧾           | publicar agora: `{ versionId, expectedRowVersion }` → `202 { publicationId, jobId }`                                                                       |
| POST  | `/drafts/{id}/retry-publication` 🔒 🔐 ⚡ 🧾 | `{ expectedRowVersion }`; só se última `Publication` = `FAILED` não ambígua (`412 PUBLICATION_NOT_RETRYABLE`). Mesmo risco do publish now → sessão elevada |
| POST  | `/drafts/{id}/discard` 🔒                    | `{ reason? }`                                                                                                                                              |
| GET   | `/drafts/{id}/approvals` 🔒                  | `Approval[]` do draft (histórico de decisões, humanas e automáticas)                                                                                       |
| GET   | `/drafts/{id}/audit` 🔒                      | `AuditEvent[]` do draft e suas publicações                                                                                                                 |

### 2.9 Agenda e publicações

| Verbo  | Rota                                 | Notas                                                                       |
| ------ | ------------------------------------ | --------------------------------------------------------------------------- |
| GET    | `/schedules?from&to` 🔒              | calendário; retorna `scheduledAt` (UTC) + `timezone` + `requestedLocalTime` |
| DELETE | `/schedules/{id}` 🔒                 | cancela (draft volta a `APPROVED`)                                          |
| POST   | `/publications/publish-now` 🔐 🧾    | MVP-0: publica texto livre agora, síncrono; `201 Publication`               |
| GET    | `/publications` 🔒                   | histórico                                                                   |
| GET    | `/publications/{id}` 🔒              | status, `externalPostId`, `externalUrl`, `error` (sem token)                |
| POST   | `/publications/{id}/reconcile` 🔒 ⚡ | para `AMBIGUOUS`: consulta LinkedIn e resolve (ADR-0003)                    |

### 2.10 Mídia

| Verbo  | Rota                  | Notas                                                                                  |
| ------ | --------------------- | -------------------------------------------------------------------------------------- |
| POST   | `/media` 🔒           | `multipart/form-data` (limites: tipo/tamanho) → `MediaAsset`                           |
| POST   | `/media/render` 🔒 ⚡ | `{ kind: "CODE_CARD", spec: { language, code, title?, theme? } }` → job `media.render` |
| GET    | `/media/{id}` 🔒      | metadados + `signedUrl` (expira em minutos)                                            |
| DELETE | `/media/{id}` 🔒      | 409 se anexado a versão publicada                                                      |

### 2.11 Notificações e auditoria

| Verbo | Rota                                           | Notas                                                                                                                                                                                                                                                                                                                                                                                     |
| ----- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET   | `/notifications` 🔒                            | in-app, paginado. `kind` ∈ `NotificationKind` = `CURATION_READY \| DRAFT_READY \| DRAFT_PREFETCHED \| APPROVAL_NEEDED \| AUTOPILOT_WILL_PUBLISH \| AUTOPILOT_PUBLISHED \| AUTOPILOT_REVOKED \| PUBLISHED \| PUBLICATION_FAILED \| PUBLICATION_AMBIGUOUS \| TOKEN_EXPIRING \| REAUTH_REQUIRED \| RUN_FAILED` (`DRAFT_PREFETCHED`, `AUTOPILOT_REVOKED` adicionados 2026-10-13, PRD v0.2 §6) |
| POST  | `/notifications/{id}/read` 🔒                  |                                                                                                                                                                                                                                                                                                                                                                                           |
| GET   | `/audit-events?entityType&entityId&from&to` 🔒 | somente OWNER                                                                                                                                                                                                                                                                                                                                                                             |

### 2.12 Webhooks

| Verbo | Rota                 | Notas                                                                                                                                          |
| ----- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| POST  | `/webhooks/telegram` | **desligado no MVP** (pergunta Q3). Se ligado: exige `X-Telegram-Bot-Api-Secret-Token` = `TELEGRAM_WEBHOOK_SECRET`; só comandos de leitura/ack |

### 2.13 Carreira: CV base (spec `2026-10-22-cv-tailoring-design.md` §7)

| Verbo  | Rota                    | Notas                                                                                                                                                                                                                         |
| ------ | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/career/cv` 🔒         | `CvBaseState { active: CvBase \| null, draft: CvDraft \| null }`; `draft.status` ∈ `EXTRACTING \| READY \| FAILED`. `Cache-Control: no-store` em todo o grupo                                                              |
| POST   | `/career/cv` 🔒 ⚡      | `multipart/form-data`, um único campo `file`: PDF (pela assinatura `%PDF-`) ≤ 5 MiB, com texto selecionável, ≤ 20 páginas → `202 CvUploadAccepted { id, status, jobId, draft }` + job `cv.extract` na mesma transação do rascunho (falha da fila → `503 UPSTREAM_UNAVAILABLE`, nada gravado). Substitui o rascunho. Rate limit por usuário |
| POST   | `/career/cv/confirm` 🔒 | `{ draftId, content: CvStructured, acknowledgeInjection? }` → `200 CvBase`; ativa o rascunho `READY` e desativa a versão anterior. Sem rascunho `READY` com esse id → `409 CV_DRAFT_NOT_READY`; rascunho com `injectionSuspected` sem `acknowledgeInjection: true` → `409 CV_INJECTION_UNACKNOWLEDGED` (ADR-0005 §4)                                                    |
| DELETE | `/career/cv` 🔐         | somente OWNER; apaga todas as versões e o rascunho → `204`                                                                                                                                                                    |

### 2.14 Carreira: lotes e vagas (spec `2026-10-22-cv-tailoring-design.md` §7, PR 3b)

| Verbo  | Rota                           | Notas |
| ------ | ------------------------------ | ----- |
| POST   | `/career/batches` 🔒 ⚡        | `{ urls: JobPostingUrl[] }`, de 1 a 20 links `http(s)` com domínio (sem IP literal, sem `localhost`, sem credencial). Responde `202 TailoringBatchAccepted { id, status, jobId, batchId, cvBaseId, duplicatesMerged, blocked, postings, jobIds }`. Link do LinkedIn que não é `/jobs/view/<id>` (nem traz `currentJobId`) nunca ganha `job.fetch` (ADR-0008 §1): nasce `FAILED`/`FETCH_BLOCKED`, sem job e sem gastar cota, e conta em `blocked`. Se todos os links forem bloqueados, `status` é `FAILED` e `jobId` é `null`. Link que passa de 2048 caracteres depois de normalizado (por exemplo, `é` → `%C3%A9`) → `422 JOB_POSTING_URL_REJECTED`, com a posição do link e sem a URL, antes da transação. Links duplicados (pela URL normalizada, sem fragmento nem rastreamento) são unificados. O lote, as vagas e um `job.fetch` por vaga (`group = domínio registrável`) entram na mesma transação; se a fila falhar, responde `503 UPSTREAM_UNAVAILABLE` e nada é gravado. Sem CV base confirmado → `412 CV_BASE_REQUIRED`. Rate limit por usuário |
| GET    | `/career/jobs?limit&cursor` 🔒 | `JobPostingSummaryPage`, das mais novas para as mais antigas. O `cursor` é o id da última vaga da página anterior. Sem texto da vaga nem conteúdo de CV. `Cache-Control: no-store` em todo o grupo |
| GET    | `/career/jobs/{id}` 🔒         | `JobPostingDetail`: extração, `injectionSuspected`/`injectionEvidence` e `tailoring` (CV adaptado com proveniência, `MatchReport` e `generatedWithPreviousCv`), este só em `READY`. Vaga de outro usuário → `404` |
| POST   | `/career/jobs/{id}/text` 🔒 ⚡ | `{ text }` de 200 a 20 000 caracteres → `202 JobPostingAccepted`. A vaga volta a `FETCHING` como `PASTED` e o `job.fetch` usa o grupo `pasted`. Vaga em `FETCHING`/`ANALYZING` → `409 JOB_POSTING_INVALID_TRANSITION` |
| POST   | `/career/jobs/{id}/retry` 🔒 ⚡ | `202 JobPostingAccepted`. Com extração e texto, só refaz o `cv.tailor` (`ANALYZING`); senão, refaz o `job.fetch` (`FETCHING`), com o texto guardado ou buscando o link de novo (o breaker é decidido no worker). Sem texto e com um link do LinkedIn que não é vaga → `422 JOB_POSTING_URL_REJECTED` (cole o texto). O CV adaptado anterior é substituído. Vaga em andamento → `409 JOB_POSTING_INVALID_TRANSITION` |
| GET    | `/career/jobs/{id}/pdf` 🔒     | CV adaptado em PDF (`application/pdf`, binário), gerado na hora a partir da **versão do CV base usada na adaptação** (`tailored_cvs.cv_base_id`), nunca da ativa (ADR-0009). `Content-Disposition: attachment; filename="CV-<nome>-<empresa>-<cargo>.pdf"` (só ASCII, dígitos e hífen; o nome vem do contato do CV base) e `Cache-Control: no-store`. Vaga de outro usuário → `404`; vaga fora de `READY` → `409 TAILORED_CV_NOT_READY`; CV adaptado que referencia itens que não existem mais no CV base → `409 TAILORED_CV_STALE` (reprocesse a vaga; o audit guarda só o id). Erros em Problem Details. Rate limit por usuário |
| DELETE | `/career/jobs/{id}` 🔒         | apaga a vaga e o CV adaptado → `204`; o lote sai junto com a última vaga |

---

## 3. Payloads essenciais

### 3.1 `Opportunity` (contrato do briefing §13, mantido literalmente + campos internos opcionais)

```jsonc
{
  "id": "uuid",
  "title": "string",
  "summary": "string",
  "sourceIds": ["uuid"], // ids de SourceItem
  "publishedAt": "2026-10-13T11:00:00Z", // ou null
  "contentPillar": "string", // slug do ContentPillar
  "targetAudience": "string",
  "relevanceReason": "string",
  "suggestedAngle": "string",
  "suggestedFormat": "text", // text | code-card | image | carousel
  "score": 87.5, // 0–100
  "status": "candidate", // candidate | selected | dismissed | expired
  // internos (opcionais no DTO)
  "rank": 1,
  "curationRunId": "uuid",
  "origin": "CURATION",
  "scoreBreakdown": {
    "recency": 0.9,
    "pillarFit": 0.8,
    "audienceFit": 0.9,
    "novelty": 0.7,
    "sourceTrust": 0.8,
    "voiceFit": 0.6,
    "risk": 0.1,
  },
  // voiceFit = Rodrigo tem material próprio (Story Bank) para o tema; risk = polêmica/incerteza factual (0–1, menor é melhor).
  // Alinhamento 2026-10-13 (Atlas): aceitas as propostas de Pena (docs/editorial/structured-outputs.md §1.2); o engine mapeia freshness→recency, sourceQuality→sourceTrust, relevance→pillarFit+audienceFit; novelty vem do dedupe/histórico, não do modelo.
  "expiresAt": "2026-10-15T12:00:00Z",
  "draftId": null,
}
```

### 3.2 `Draft` e `DraftVersion`

```jsonc
{
  "id": "uuid",
  "opportunityId": "uuid",
  "status": "IN_REVIEW",
  "language": "pt-BR",
  "rowVersion": 4,
  "currentVersion": { "...DraftVersion" },
  "approvedVersion": null,
  "schedule": null,
  "lastPublication": null,
  "failureReason": null,
  "isPrefetch": false,                    // true = pré-gerado por assistedPrefetchDraft, ainda não adotado
  "proposedSlot": { "localDateTime": "2026-10-15T09:00", "timezone": "America/Sao_Paulo" }   // ou null; sugestão, não agendamento
}
```

```jsonc
{
  "id": "uuid",
  "draftId": "uuid",
  "versionNumber": 2,
  "parentVersionId": "uuid",
  "authorType": "SYSTEM", // SYSTEM | USER
  "body": "string",
  "hooks": [{ "text": "string", "formula": "H07", "rationale": "string" }], // formula: HookFormula (string | null); rationale: string | null — alinhamento 2026-10-13, aceita proposta de Pena
  "mediaSuggestion": {
    "format": "code-card",
    "description": "string",
    "altText": "string",
    "codeSnippet": "string|null",
  }, // null quando o post é só texto; altText OBRIGATÓRIO (≤ 300 chars) sempre que mediaSuggestion ≠ null — alinhamento 2026-10-13, acessibilidade
  "citations": [{ "sourceItemId": "uuid", "url": "https://...", "claim": "string", "quote": "string" }],
  "storyEntryIds": ["uuid"],
  "mediaAssetIds": ["uuid"],
  "generation": {
    "promptId": "draft-writer",
    "promptVersion": "1.2.0",
    "model": "string",
    "engineVersion": "0.3.0",
  },
  "eval": { "clicheScore": 0.1, "voiceMatch": 0.9, "unsupportedClaims": [] },
  "createdAt": "2026-10-13T12:00:00Z",
}
```

**Decisão de alinhamento (2026-10-13, Atlas):** as três divergências apontadas por Pena em `docs/editorial/structured-outputs.md` §1.2 foram aceitas — `scoreBreakdown` ganha `voiceFit` e `risk`; `hooks` passa a `{ text, formula, rationale }[]`; `mediaSuggestion.altText` é obrigatório quando há mídia. Mudanças aditivas; nomes do `packages/contracts` prevalecem na persistência/API e o engine converte a saída do modelo (ADR-0005).

### 3.3 `Schedule`, `Publication`, `Approval`

```jsonc
// Schedule
{ "id": "uuid", "draftId": "uuid", "draftVersionId": "uuid",
  "scheduledAt": "2026-10-15T12:00:00Z", "timezone": "America/Sao_Paulo",
  "requestedLocalTime": "2026-10-15T09:00", "status": "PENDING", "createdByType": "USER" }

// Publication
{ "id": "uuid", "draftId": "uuid", "draftVersionId": "uuid", "scheduleId": null,
  "status": "SUCCEEDED", "attempt": 1,
  "externalPostId": "urn:li:share:123", "externalUrl": "https://www.linkedin.com/feed/update/urn:li:share:123",
  "publishedAt": "2026-10-15T12:00:03Z", "error": null }

// Approval
{ "id": "uuid", "draftVersionId": "uuid", "decision": "APPROVED",
  "actorType": "SYSTEM", "autonomyMode": "AUTOPILOT_CONTROLLED",
  "reason": "score 91 ≥ 85; pillar 'engenharia' allowed; weekly cap 2/3", "createdAt": "..." }
```

### 3.4 `AutonomySettings`

```jsonc
{
  "mode": "ASSISTED",
  "autoApproveMinScore": null,
  "allowedPillarIds": [],
  "maxAutoPostsPerWeek": 3,
  "cancelWindowMinutes": 60,
  "mediaRequiresHuman": true,
  "assistedPrefetchDraft": false,
  "quietHours": { "start": "22:00", "end": "07:00", "timezone": "America/Sao_Paulo" },
}
```

---

## 4. Erros

Formato **RFC 9457 Problem Details** (`Content-Type: application/problem+json`), com código estável para o cliente:

```jsonc
{
  "type": "https://linkedin-ops.local/errors/invalid-transition",
  "title": "Transição de estado inválida",
  "status": 409,
  "detail": "Draft em IN_REVIEW não aceita 'schedule'",
  "instance": "/api/v1/drafts/7f.../schedule",
  "code": "DRAFT_INVALID_TRANSITION",
  "correlationId": "req_01J...",
  "errors": [{ "path": ["timezone"], "message": "IANA timezone obrigatório" }], // só em 400
}
```

| HTTP | `code` (exemplos)                                                                                                                                                                                                                               | Quando                                                                                                                               |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 400  | `VALIDATION_FAILED`, `IDEMPOTENCY_KEY_REQUIRED`                                                                                                                                                                                                 | Zod falhou (`errors[]` por campo) / ação 🧾 sem header                                                                               |
| 401  | `AUTH_REQUIRED`, `AUTH_INVALID_CREDENTIALS`, `AUTH_REAUTH_REQUIRED`                                                                                                                                                                             | sem sessão / login inválido / endpoint 🔐 sem sessão elevada                                                                         |
| 403  | `FORBIDDEN`, `CSRF_REJECTED`                                                                                                                                                                                                                    | role insuficiente / origem inválida                                                                                                  |
| 404  | `NOT_FOUND`                                                                                                                                                                                                                                     | recurso inexistente **ou de outro usuário** (não vazar existência)                                                                   |
| 409  | `DRAFT_INVALID_TRANSITION`, `OPPORTUNITY_INVALID_TRANSITION`, `ROW_VERSION_MISMATCH`, `IDEMPOTENCY_KEY_CONFLICT`, `CURATION_RUN_IN_PROGRESS`, `PUBLICATION_ALREADY_EXISTS`, `SCHEDULE_ALREADY_PENDING`, `CONTENT_PILLAR_IN_USE`, `MEDIA_IN_USE`, `CV_DRAFT_NOT_READY`, `CV_INJECTION_UNACKNOWLEDGED`, `JOB_POSTING_INVALID_TRANSITION`, `TAILORED_CV_NOT_READY`, `TAILORED_CV_STALE` | conflito de estado, recurso em uso ou `Idempotency-Key` reutilizada com corpo diferente                                              |
| 412  | `LINKEDIN_REAUTH_REQUIRED`, `APPROVED_VERSION_REQUIRED`, `PUBLICATION_NOT_RETRYABLE`, `CV_BASE_REQUIRED`                                                                                                                                                           | pré-condição de domínio                                                                                                              |
| 422  | `JOB_POSTING_URL_REJECTED`, `SOURCE_URL_NOT_ALLOWED`, `SCHEDULE_IN_PAST`, `TIMEZONE_INVALID`, `CV_PDF_UNREADABLE` (PDF corrompido, protegido, sem texto, páginas ou texto demais)                                                                                                                                                                                | semanticamente inválido                                                                                                              |
| 429  | `RATE_LIMITED`                                                                                                                                                                                                                                  | com `Retry-After`                                                                                                                    |
| 413  | `PAYLOAD_TOO_LARGE`                                                                                                                                                                                                                             | corpo da requisição acima do limite (JSON: 1 MiB; T-008)                                                                             |
| 415  | `UNSUPPORTED_MEDIA_TYPE`                                                                                                                                                                                                                        | Só em rotas que declaram `Content-Type` não JSON (upload); mutação JSON com outro `Content-Type` → 403 `CSRF_REJECTED` (ADR-0007 N4) |
| 503  | `UPSTREAM_UNAVAILABLE`, `SERVICE_NOT_READY`                                                                                                                                                                                                     | OpenAI/LinkedIn/S3 indisponível em chamada síncrona (rara) / `GET /ready` falhou                                                     |
| 500  | `INTERNAL`                                                                                                                                                                                                                                      | sem detalhes internos; `correlationId` para o log                                                                                    |

O `web` mapeia `code` → mensagem PT-BR; nunca interpreta `detail` para tomar decisão.

---

## 5. Versionamento

- Prefixo `/api/v1`. Mudanças **aditivas** (novo campo opcional, novo endpoint, novo valor de enum
  marcado como `x-extensible`) não mudam a versão. Clientes ignoram campos desconhecidos.
- Mudança **incompatível** (remover/renomear campo, mudar semântica, remover valor de enum) → `/api/v2`
  convivendo com `v1` por um período definido; registrado em `CHANGELOG` do `packages/contracts`.
- `packages/contracts` segue SemVer interno do monorepo; `api`, `web` e `worker` sempre consomem a
  mesma versão (workspace), então a disciplina é mais sobre **jobs em voo**: payloads de job carregam
  `schemaVersion` e handlers aceitam N-1 durante deploys.
- OpenAPI servida em `GET /api/v1/openapi.json` (🔒 em produção; público em dev) e commitada em
  `packages/contracts/openapi/v1.json` com teste que falha se divergir do código (contract drift).
- Headers do LinkedIn (`LinkedIn-Version`) são configuração do adapter, não da nossa API.

---

## 6. `packages/contracts`

Pacote TypeScript **sem dependências de runtime além de `zod` (v4)**. JSON Schema e OpenAPI são gerados com
`z.toJSONSchema` nativo (`common/json-schema.ts`: `toJsonSchema`, `toOpenApiSchema`, `toStructuredOutputSchema`,
`findStrictModeViolations`); nenhuma biblioteca extra. Consumido por `web`, `api`, `worker`, `editorial-engine`
e `domain`. Não contém lógica de negócio; só forma. A tabela de transições do conteúdo (`state/content-transitions.ts`)
é **dado** (`CONTENT_TRANSITIONS`, `canTransition`, `resolveTransition`), sem guardas: a state machine com guardas,
efeitos e auditoria fica em `packages/domain`.

```text
packages/contracts/
  src/
    common/        ids.ts  pagination.ts  problem.ts  datetime.ts (IanaTimezone, LocalDateTime)
    enums/         autonomy-mode.ts  draft-status.ts  opportunity-status.ts  publication-status.ts  …
    resources/     auth.ts  user.ts  autonomy-settings.ts  voice-profile.ts  story-bank.ts
                   content-pillar.ts  source.ts  source-item.ts  watchlist.ts  curation-run.ts
                   opportunity.ts  draft.ts  draft-version.ts  approval.ts  schedule.ts
                   publication.ts  media-asset.ts  notification.ts  audit-event.ts
    routes/        v1.ts          ← registry: { method, path, params, query, body, responses, auth, idempotent }
    jobs/          queues.ts      ← nomes de fila + payload Zod + opções padrão (retry, expireIn, singleton)
    engine/        structured-outputs.ts ← schemas JSON Schema (strict) derivados do Zod, usados pelo worker com OpenAI
    index.ts
  openapi/v1.json                 ← gerado; teste de drift
  CHANGELOG.md
```

Regras:

1. **Um schema, três usos**: o mesmo `z.object` valida no `web` (RHF resolver, UX), na `api`
   (`ZodValidationPipe`, autoritativo) e no `worker` (payload de job). Tipos são `z.infer`.
2. **`routes/v1.ts` é a única descrição das rotas.** A api monta controllers a partir dela (ou testa que
   cada rota registrada existe); o web gera um cliente tipado (`createClient(routes)`), sem `fetch` solto.
3. **`jobs/queues.ts`** define, por fila: `name`, `payload` (Zod), `retryLimit`, `retryBackoff`,
   `expireInSeconds`, `singletonKeyFrom(payload)`, `deadLetter`. api e worker usam a mesma definição.
4. **Enums são `z.enum` únicos**; o Prisma `enum` espelha; teste garante paridade.
5. Datas: `z.iso.datetime({ offset: false, local: false })` + sufixo `Z` nas respostas; `IanaTimezone` validado
   com `Intl.supportedValuesOf('timeZone')` **mais `UTC`** (o Node não lista `UTC`); `LocalDateTime` = `YYYY-MM-DDTHH:mm` sem offset.
6. Nenhum schema de resposta contém campo de segredo. Teste de contrato percorre os schemas e falha se
   encontrar `/token|secret|password|apiKey/i`.
7. Mudança em `contracts` que quebre `web`/`worker` exige PR tocando os consumidores (monorepo) e revisão de Atlas.
8. Dead-letter de cada fila chama-se `<queue>.dlq`. Validação de allowlist de host e de IP privado em `Source.url`
   é da api (precisa de DNS); o schema garante só `https` + hostname válido.
9. `DraftVersion.eval.quality` tipa o DTO com o `QualityEvaluation` (schemaVersion do modelo, Pena). Um bump de
   schema do modelo é mudança de API: só aditiva (campo novo nullable, nunca remover) ou versionada; registrar no CHANGELOG.
10. `AuditEvent.before/after` são validados por `RedactedJsonObjectSchema` (JSON recursivo que rejeita chaves
    `/token|secret|password|apiKey|ciphertext/i` em qualquer profundidade) **antes** de persistir; ações 🔐 exigem role
    OWNER (`OWNER_ONLY`) além de sessão elevada; callback OAuth aceita exatamente um de `code`/`error`.

**Ratificação T-004 (2026-10-13, Atlas):** o pacote `@linkedin-ops/contracts@0.1.0` (PR #68, Alicerce) é a fonte de
verdade; as divergências registradas no PR foram aceitas e incorporadas acima (zod 4 nativo; `openapi/v1.json` + teste
de drift em T-008; `GET /drafts/{id}/approvals`; códigos de erro adicionais; `expectedRowVersion` em todas as mutações de
draft; `OPPORTUNITY` do §13 = `CANDIDATE`; `discard` também de `GENERATING`/`SCHEDULED`; `Draft.needsReconciliation`;
nomes de Pena nos Structured Outputs e de `contracts` nos DTOs, ADR-0005 §9; `<queue>.dlq`).

### 6.1 Filas (nomes e payloads mínimos)

| Fila                     | Payload                           | Singleton        | Retry                       | Produtor → consumidor           |
| ------------------------ | --------------------------------- | ---------------- | --------------------------- | ------------------------------- |
| `source.fetch`           | `{ sourceId, dryRun }`            | `sourceId`       | 3, backoff                  | worker (cron/curation) → worker |
| `curation.run`           | `{ curationRunId }`               | `curationRunId`  | 2                           | cron/api → worker               |
| `curation.expire`        | `{ userId }`                      | `userId`         | 1                           | cron → worker                   |
| `draft.generate`         | `{ draftId, opportunityId }`      | `draftId`        | 2 (só erros transientes)    | api → worker                    |
| `draft.regenerate`       | `{ draftId, instructions? }`      | `draftId`        | 2                           | api → worker                    |
| `media.render`           | `{ mediaAssetId }`                | `mediaAssetId`   | 2                           | api → worker                    |
| `media.upload-linkedin`  | `{ mediaAssetId, publicationId }` | `mediaAssetId`   | 3                           | worker → worker                 |
| `publication.publish`    | `{ publicationId }`               | `publicationId`  | **0 automático** (ADR-0003) | api/worker → worker             |
| `schedule.reconcile`     | `{}`                              | fixed            | 1                           | cron (5 min) → worker           |
| `publication.reconcile`  | `{ publicationId }`               | `publicationId`  | 3                           | api/alerta → worker             |
| `notification.send`      | `{ notificationId }`              | `notificationId` | 5, backoff                  | worker/api → worker             |
| `linkedin.token-refresh` | `{ userId }`                      | `userId`         | 3                           | cron diário → worker            |
| `cv.extract`             | `{ cvBaseId }`                    | `cvBaseId`       | 2, backoff                  | api → worker                    |
| `job.fetch`              | `{ jobPostingId }`                | `jobPostingId`   | 1, após 60 s (ADR-0008)     | api → worker                    |
| `cv.tailor`              | `{ jobPostingId }`                | `jobPostingId`   | 2, backoff                  | worker → worker                 |

Todos os payloads carregam `schemaVersion`, `correlationId` e `requestedBy` (`{ type: USER\|SYSTEM, id }`).

---

## 7. Perguntas abertas

| #   | Pergunta                                                                                     | Hipótese adotada                                                       |
| --- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Q10 | Gerar controllers a partir de `routes/v1.ts` (ex.: ts-rest/nestjs-zod) ou só testar paridade | Só paridade no MVP (menos magia); Alicerce decide ferramenta com Atlas |
| Q11 | Cliente web gerado de OpenAPI (`openapi-fetch`) ou do registry Zod                           | Registry Zod (tipos já existem; sem passo de geração)                  |
| Q12 | Expor `generation.usage` (tokens/custo) na API                                               | Sim para OWNER, para analytics de custo                                |
