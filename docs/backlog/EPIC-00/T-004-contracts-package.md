# T-004 · Pacote `contracts` (schemas Zod + tipos compartilhados)

- Épico: EPIC-00 Foundation
- Responsável (papel/agente): Alicerce (backend) · definição e revisão Atlas
- Branch/floor: `feat/T-004-contracts-package`
- Estado: todo
- Dependências: T-001; `docs/architecture/data-model.md` (Atlas)

## Contexto

Web, API, worker e editorial-engine devem consumir os mesmos contratos. Regras de domínio não podem ser duplicadas no frontend. O contrato mínimo de oportunidade e os estados do conteúdo estão no briefing §13 e no PRD §7–8.

## Resultado esperado

`packages/contracts` com schemas Zod e tipos inferidos para: `Opportunity`, `OpportunityBatch`, `ContentItem` + enum de estados, `ContentVersion`, `Approval`, `Schedule`, `Publication`, `Source`, `VoiceProfile`, `StoryBankEntry`, `AutonomyPolicy`, `AuditEvent`, `Notification`, além de utilitários de transição de estado (`canTransition(from, to)`). Enum `suggestedFormat = text|code-card|image|carousel`.

## Critérios de aceite (verificáveis)

- [ ] Schemas cobrem todos os campos do contrato §13 do briefing com os mesmos nomes.
- [ ] Testes unitários (Vitest) da tabela de transições do PRD §8.2: transições permitidas passam, proibidas falham.
- [ ] Pacote sem dependência de NestJS/Next (puro TS + Zod).
- [ ] Changelog/versionamento semântico interno documentado no README do pacote.

## Fora de escopo

Persistência (T-005), endpoints (T-008).

## Plano de teste

Vitest nos schemas (parse de fixtures válidas/inválidas) e nas transições.

## Riscos de segurança / compliance

Campos sensíveis (tokens) **não** fazem parte de contratos expostos ao frontend.
