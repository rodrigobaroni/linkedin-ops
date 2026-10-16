# T-004 · Pacote `contracts` (schemas Zod + tipos compartilhados)

- Épico: EPIC-00 Foundation
- Responsável (papel/agente): Alicerce (backend) · definição e revisão Atlas
- Branch/floor: `feat/T-004-contracts-package`
- Estado: review
- Dependências: T-001; `docs/architecture/data-model.md` (Atlas)

## Contexto

Web, API, worker e editorial-engine devem consumir os mesmos contratos. Regras de domínio não podem ser duplicadas no frontend. O contrato mínimo de oportunidade e os estados do conteúdo estão no briefing §13 e no PRD §7–8.

## Resultado esperado

`packages/contracts` com schemas Zod e tipos inferidos para: `Opportunity`, `OpportunityBatch`, `ContentItem` + enum de estados, `ContentVersion`, `Approval`, `Schedule`, `Publication`, `Source`, `VoiceProfile`, `StoryBankEntry`, `AutonomyPolicy`, `AuditEvent`, `Notification`, além de utilitários de transição de estado (`canTransition(from, to)`). Enum `suggestedFormat = text|code-card|image|carousel`.

## Critérios de aceite (verificáveis)

- [x] Schemas cobrem todos os campos do contrato §13 do briefing com os mesmos nomes (`OpportunitySchema`; fixture "Opportunity (briefing §13 minimal)").
- [x] Testes unitários (Vitest) da tabela de transições do PRD §8.2: transições permitidas passam, proibidas falham (`test/content-transitions.test.ts`).
- [x] Pacote sem dependência de NestJS/Next (puro TS + Zod 4; `test/boundaries.test.ts` garante imports só de `zod`/relativos).
- [x] Changelog/versionamento semântico interno documentado no README do pacote (`packages/contracts/README.md`, `CHANGELOG.md`).

## Fora de escopo

Persistência (T-005), endpoints (T-008).

## Plano de teste

Vitest nos schemas (parse de fixtures válidas/inválidas) e nas transições.

## Riscos de segurança / compliance

Campos sensíveis (tokens) **não** fazem parte de contratos expostos ao frontend.

## Registro de execução (2026-10-13, Alicerce)

- Implementado em `packages/contracts` conforme `docs/architecture/contracts.md` §6: `common/`, `enums/`, `resources/`,
  `state/content-transitions.ts`, `routes/v1.ts`, `jobs/queues.ts`, `engine/structured-outputs.ts`.
- Dependência de runtime: só `zod@^4`. O helper de JSON Schema usa `z.toJSONSchema` nativo do Zod 4 (equivalente a
  `zod-to-json-schema`), com alvo draft 2020-12 (Structured Outputs, strict) e OpenAPI 3.0.
- Decisões/hipóteses registradas no PR (divergências em relação a `contracts.md` para o Atlas atualizar o doc):
  `@asteasolutions/zod-to-openapi` não adicionado (Zod 4 nativo cobre); `openapi/v1.json` e o teste de drift ficam
  para T-008; rota adicional `GET /drafts/{id}/approvals`; `expectedRowVersion` em todas as mutações de draft;
  estado `OPPORTUNITY` do briefing §13 nomeado `CANDIDATE` (data-model.md); schemas de saída do modelo mantêm os
  nomes de Pena (ADR-0005 §9) e os DTOs os nomes de `contracts.md`.
- Revisões aplicadas no PR #68: Atlas (aprovado com ressalvas) R1 `retry-publication` elevado, R2 respostas 202
  estendem `AsyncAccepted`, R3 `publication.publish` expira em 300 s / `cancelWindowMinutes ≥ 5` /
  `HumanizationReport.promptId` tipado, R4 regra de versionamento de `eval.quality` no CHANGELOG. Sentinela
  (bloqueado → corrigido) S-1 `roles: OWNER` + sessão elevada nas ações de alto risco, S-2 `AuditEvent.before/after`
  com schema JSON recursivo que rejeita chaves sensíveis, S-3 callback OAuth com XOR `code`/`error`, S-4 senha mínima
  15, S-5 `rateLimited` em OAuth start/callback/disconnect e autonomia, S-6 inputs, queries, params e payloads de job
  `strictObject` (chaves extras falham). R5 do Atlas (select + create_draft na mesma transação) é nota para T-005/T-008.
