# T-008 · API base (NestJS, OpenAPI, erros, config)

- Épico: EPIC-00 Foundation
- Responsável (papel/agente): Alicerce (backend) · revisão Atlas
- Branch/floor: `feat/T-008-api-baseline-nestjs`
- Estado: todo
- Dependências: T-004, T-005; ADR-0007 (N1–N4) e ADR-0004 (item 13) como condições de revisão

## Contexto

A API é a única fonte de regras de negócio para web e worker. Precisa de OpenAPI gerado, validação por Zod, formato de erro único e configuração validada no boot.

## Resultado esperado

`apps/api` com módulos base, validação de `.env` no boot (falha rápida), pipe de validação Zod usando `packages/contracts`, formato de erro padronizado (`code`, `message` em PT-BR, `correlationId`), OpenAPI em `/docs` (apenas em dev) e export para `packages/contracts/openapi.json`, health `/health` e `/ready`, Pino com redaction de campos sensíveis, Supertest configurado.

## Critérios de aceite (verificáveis)

- [ ] Boot sem `DATABASE_URL` falha com mensagem clara; placeholders de `.env.example` (`change-me*`) são rejeitados em `NODE_ENV=production` (SEC-004 do threat model).
- [ ] Requisição inválida retorna 400 com formato padronizado; teste cobre.
- [ ] OpenAPI gerado em CI e versionado; diff de contrato aparece no PR.
- [ ] Logs redigem `authorization`, `cookie`, `token`, `apiKey`.
- [ ] `csrfToken` nunca aparece em log, trace ou snapshot: Pino redige o campo e o canário de teste `AuditSnapshotSchema` rejeita qualquer objeto que contenha `csrfToken` (Sentinela, revisão do PR #68).
- [ ] `POST /auth/login`, `POST /auth/reauth` e `GET /auth/me` respondem com `Cache-Control: no-store`; o body dessas respostas nunca é logado (teste de header + teste de log).
- [ ] `auth.login` e `auth.reauth` respondem `200 { csrfToken, elevatedUntil | null }` (não `204`) e `GET /auth/me` sempre inclui `csrfToken`, exatamente como `packages/contracts` define desde o PR #68 (ADR-0007 N2; follow-up de Atlas).
- [ ] Toda resposta que rotaciona a sessão carrega o novo token no header `X-CSRF-Token`; a rotação do token é sincronizada com a da sessão, sem janela em que o token antigo e o novo coexistam (ADR-0007 N2).
- [ ] Guard global de mutação conforme ADR-0007 N4: `POST/PUT/PATCH/DELETE` exigem sessão válida (única exceção `POST /auth/login`), `Origin` igual a `APP_BASE_URL`, `Content-Type: application/json`, header `X-Requested-With: linkedin-ops`; form bodies, `Origin: null` e method override são rejeitados. Testes negativos por controle.
- [ ] Config de boot valida `SESSION_SECRET` (≥ 32 bytes, não placeholder) com o mesmo `validateRuntimeEnv` de `ENCRYPTION_KEY`; o parse do key ring é estrito e sem fallback silencioso, conforme ADR-0004 item 13(a) (a cifra em si fica em T-052).

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
