# T-008 · API base (NestJS, OpenAPI, erros, config)

- Épico: EPIC-00 Foundation
- Responsável (papel/agente): Alicerce (backend) · revisão Atlas
- Branch/floor: `feat/T-008-api-baseline-nestjs`
- Estado: review (PR aberto pelo Maestro a partir do floor `feat/T-008-api-baseline-nestjs`)
- Dependências: T-004, T-005; ADR-0007 (N1–N4) e ADR-0004 (item 13) como condições de revisão

## Contexto

A API é a única fonte de regras de negócio para web e worker. Precisa de OpenAPI gerado, validação por Zod, formato de erro único e configuração validada no boot.

## Resultado esperado

`apps/api` com módulos base, validação de `.env` no boot (falha rápida), pipe de validação Zod usando `packages/contracts`, formato de erro padronizado (`code`, `message` em PT-BR, `correlationId`), OpenAPI em `/docs` (apenas em dev) e export para `packages/contracts/openapi/v1.json` (caminho do `contracts.md` §5), health `/health` e `/ready`, Pino com redaction de campos sensíveis, Supertest configurado.

## Critérios de aceite (verificáveis)

- [x] Boot sem `DATABASE_URL` falha com mensagem clara; placeholders de `.env.example` (`change-me*`) são rejeitados em `NODE_ENV=production` (SEC-004 do threat model).
- [x] Requisição inválida retorna 400 com formato padronizado; teste cobre.
- [x] OpenAPI gerado em CI e versionado; diff de contrato aparece no PR.
- [x] Logs redigem `authorization`, `cookie`, `token`, `apiKey`.
- [x] `csrfToken` nunca aparece em log, trace ou snapshot: Pino redige o campo e o canário de teste `AuditSnapshotSchema` rejeita qualquer objeto que contenha `csrfToken` (Sentinela, revisão do PR #68).
- [x] `POST /auth/login`, `POST /auth/reauth` e `GET /auth/me` respondem com `Cache-Control: no-store`; o body dessas respostas nunca é logado (teste de header + teste de log).
- [x] `auth.login` e `auth.reauth` respondem `200 { csrfToken, elevatedUntil | null }` (não `204`) e `GET /auth/me` sempre inclui `csrfToken`, exatamente como `packages/contracts` define desde o PR #68 (ADR-0007 N2; follow-up de Atlas).
- [x] (infra) Toda resposta que rotaciona a sessão carrega o novo token no header `X-CSRF-Token`; a rotação do token é sincronizada com a da sessão, sem janela em que o token antigo e o novo coexistam (ADR-0007 N2).
- [x] Guard global de mutação conforme ADR-0007 N4: `POST/PUT/PATCH/DELETE` exigem sessão válida (única exceção `POST /auth/login`), `Origin` igual a `APP_BASE_URL`, `Content-Type: application/json`, header `X-Requested-With: linkedin-ops`; form bodies, `Origin: null` e method override são rejeitados. Testes negativos por controle.
- [x] Config de boot valida `SESSION_SECRET` (≥ 32 bytes, não placeholder) com o mesmo `validateRuntimeEnv` de `ENCRYPTION_KEY`; o parse do key ring é estrito e sem fallback silencioso, conforme ADR-0004 item 13(a) (a cifra em si fica em T-052).

## Fora de escopo

Autenticação (T-015), domínios.

## Plano de teste

Supertest em health/erro; snapshot do OpenAPI.

## Riscos de segurança / compliance

Swagger desabilitado em produção; headers de segurança (helmet).

## Ressalvas de implementação (Sentinela e Atlas, revisões dos PRs #67/#68, 2026-10-16)

Condições normativas que o PR desta tarefa deve atender; o detalhe está nos ADRs, aqui só o resumo:

- **Token CSRF (ADR-0007 item 3 e N2).** O cliente guarda o `csrfToken` só em memória: nunca em `localStorage`, `sessionStorage`, cookie legível por JS, URL ou log. A API é a única origem do token (`/auth/login`, `/auth/reauth`, `/auth/me`, header `X-CSRF-Token` nas respostas que rotacionam sessão). Em `403 CSRF_REJECTED` o web refaz `GET /auth/me` uma vez.
- **Sem cache e sem log de body** em `/auth/login`, `/auth/reauth` e `/auth/me` (`Cache-Control: no-store`); redaction de `csrfToken` no Pino; canário `AuditSnapshotSchema` rejeitando `csrfToken`.
- **ADR-0007 N1** (claim atômico do `state` OAuth antes de qualquer chamada externa, nos caminhos `code` e `error`) e **N3** (PKCE só após prova no app real, `LINKEDIN_PKCE = required | disabled` sem fallback silencioso) são implementados em T-038, mas a base da API (config validada, formato de erro, `validateRuntimeEnv`) precisa suportá-los.
- **ADR-0007 N4** (controles de toda mutação) entra aqui como guard global; T-057 endurece o restante (cabeçalhos, rate limits).
- **ADR-0004 item 13** (parse estrito do key ring, framing autenticado de `wrapped_dek`, testes como evidência de G-02) é o gate de revisão de T-052; esta tarefa só garante que a validação de ambiente falhe fechado.
- **Contrato de auth (Atlas, PR #68).** `packages/contracts` já expõe `auth.login`/`auth.reauth` → `200 { csrfToken, elevatedUntil }` e `auth.me` com `csrfToken`; a API implementa exatamente esse contrato, sem variante `204`.

## Notas de implementação (Alicerce, 2026-10-21)

Decisões tomadas com o Maestro na aprovação do plano e o que ficou para outras tarefas:

- **HTTP: NestJS 12 sobre Fastify** (`@nestjs/platform-fastify`), dentro do ADR-0001 (NestJS). Motivos: Pino nativo
  (uma instância, uma redaction para logs de requisição e de aplicação), parser de conteúdo estrito e os plugins de
  cookie/helmet que T-015 já precisa. O `bodyParser` do Nest fica desligado (nada de `formbody`); JSON usa o parser
  estrito do Fastify e um parser catch-all descarta outros tipos para o guard responder `403 CSRF_REJECTED`.
- **Escopo vs. T-015.** Esta tarefa entrega a base: `SessionService` (interface) com `InMemorySessionService` que
  **nunca autentica** (`login`/`reauth` → `401 AUTH_INVALID_CREDENTIALS`; só testes criam sessão via `issueForTest`),
  `SessionCookieWriter` (cookie `__Host-session` + `X-CSRF-Token` sempre juntos) e os handlers de `login`/`reauth`/`me`
  no formato exato do contrato. Argon2id, `Session` no Postgres, rotação real, `elevated_until` e o HMAC do token
  são de T-015, atrás da mesma interface.
- **`validateRuntimeEnv`** vive em `packages/domain/src/env/runtime.ts` (api e worker). Placeholders `change-me*` só
  passam em `NODE_ENV=development`; o key ring é estrito em qualquer ambiente (ADR-0004 item 13a) e, **em development
  apenas**, `ENCRYPTION_KEY` ausente ou placeholder deixa o ring `null` com aviso no boot (a cifra, em T-052, falha
  fechado se o ring for `null`). Fora de development o ring é obrigatório. `API_PORT` (padrão 3001), `API_HOST`,
  `LOG_LEVEL` e o slot `LINKEDIN_PKCE` (`required | disabled`, sem regra até T-038) também são validados.
- **OpenAPI** gerado em `packages/contracts/src/openapi/document.ts` só com `z.toJSONSchema` (sem dependência nova),
  commitado em `packages/contracts/openapi/v1.json`; `test/openapi.test.ts` falha no `turbo test` do CI quando o
  arquivo diverge (`pnpm --filter @linkedin-ops/contracts openapi:generate` regenera). A api serve o mesmo documento
  em `GET /api/v1/openapi.json` (público em dev, sessão fora) e Swagger UI em `/docs` só em development, com assets
  locais (`swagger-ui-dist`) e CSP sem script inline.
- **Erros.** `ProblemDetailsFilter` único; `title` PT-BR estável por `code` (o web mapeia por `code`); `correlationId`
  = `req_<uuid v7>` também no header `X-Correlation-Id` e em toda linha de log; `429` sai com `Retry-After` em
  segundos inteiros (`ProblemError.rateLimited`). Códigos novos `PAYLOAD_TOO_LARGE` (413) e `UNSUPPORTED_MEDIA_TYPE`
  (415) para os erros do próprio Fastify (aditivo, `contracts.md` §4).
- **`/ready`**: `200 { status: "ok", checks }` quando nada falhou; `503 SERVICE_NOT_READY` com os checks em `detail`
  se algum falhou; `queue` reporta `skipped` até T-006 (`ReadinessCheck` ganhou o valor `skipped`).
- **Guard N4** lê o nível de auth do registry (`@ContractRoute`), ou `@RouteAuth` nas poucas rotas fora dele, e
  assume `session` quando não há nada (fail closed). `elevated` compara `X-CSRF-Token` em tempo constante e exige
  `elevatedUntil` futuro; `roles` → `403 FORBIDDEN`. `Sec-Fetch-Site` é checagem adicional, nunca a única.
- **Pendências desta tarefa:** `apps/api/Dockerfile` (PR #80) precisa copiar `packages/domain/dist` e trocar o
  `HEALTHCHECK` para `GET /api/v1/health` — commit pequeno após o merge do #80 (combinado com o Maestro); rate limit
  de `/auth/*` e demais cabeçalhos ficam em T-057; `trustProxy` do Fastify segue `false` até T-057 decidir a cadeia
  de proxies (Caddy).
