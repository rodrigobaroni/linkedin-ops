# T-044 · Motor de política de autonomia (3 modos, guardrails, aprovação automática com razão)

- Épico: EPIC-05 Scheduling & LinkedIn Publishing
- Responsável (papel/agente): Alicerce (backend) · gates editoriais com Pena · revisão Atlas e Sentinela
- Branch/floor: `feat/T-044-autonomy-policy-engine`
- Estado: todo
- Dependências: T-015, T-022, T-032, T-041, T-029

## Contexto

PRD §6 v0.2 (semântica de `data-model.md` §2.1: `ASSISTED | AUTOPILOT_CONTROLLED | AUTOPILOT_FULL`, ratificada em 2026-10-13, §13.11). Padrão Assistido. O motor decide seleção automática (modos piloto), aprovação automática por política (`Approval.actor = SYSTEM`) nos dois modos piloto, agendamento automático, janela de cancelamento (`cancel_window_minutes`) no controlado, trava de mídia (`require_human_for_media`), revogação ao descer de modo, opção `assistedPrefetchDraft` no Assistido, e grava a razão de cada decisão automática.

## Resultado esperado

Entidade `AutonomyPolicy` versionada (`mode`, `auto_approve_min_score`, `allowed_pillar_ids`, `max_auto_posts_per_week`, `cancel_window_minutes` (padrão 60, mín. 15), `require_human_for_media` (padrão true), `quiet_hours`, janela de publicação, tópicos sensíveis, `assistedPrefetchDraft` (padrão false)); endpoints `GET/PUT /autonomy` (subir exige prova de reautenticação de T-015; descer revoga aprovações `SYSTEM` pendentes e emite evento com a lista); serviço `evaluateGates(version|opportunity) → GateResult[]` consumindo o veredito editorial `pass|warn|fail` (T-022); hooks de domínio: ao `curation.ready` em modo piloto (ou Assistido com prefetch) seleciona a melhor candidata que passa G1–G4/G8 e enfileira geração; ao `draft_ready`: no Assistido com prefetch propõe slot e notifica `APPROVAL_NEEDED`; nos modos piloto, se G5–G10 passam e não há mídia (ou trava desligada), cria `Approval(actor = SYSTEM, reason, gateResults, policyVersion, evalRunId, cancelWindowEndsAt)` e agenda: no controlado no próximo slot ≥ agora + `cancel_window_minutes` com notificação `AUTOPILOT_WILL_PUBLISH`; no completo no próximo slot livre; `warn`, gate falho ou mídia → `IN_REVIEW` + `APPROVAL_NEEDED` ("precisa de você: <motivo>"); ação `cancel` dentro da janela volta a `APPROVED` sem slot.

## Critérios de aceite (verificáveis)

- [ ] Instalação nova: modo = `assisted` (teste de seed/migração).
- [ ] Subir sem reautenticação → 403; descer sem reautenticação → 200.
- [ ] Em `ASSISTED` sem prefetch, nenhum item muda de estado sem chamada do usuário; com prefetch, o item chega no máximo a `IN_REVIEW` + slot proposto, nunca `APPROVED` (teste de regressão com eventos simulados).
- [ ] Em `AUTOPILOT_CONTROLLED`, versão que passa gera `Approval{actor: SYSTEM}` com `reason` em PT-BR listando cada gate, valor e limiar, agenda ≥ `now + cancel_window_minutes` e emite `AUTOPILOT_WILL_PUBLISH`; `cancel` dentro da janela impede a publicação (teste).
- [ ] Em `AUTOPILOT_FULL`, agenda sem janela; versão que falha G5, tem veredito `warn`/`fail` ou contém mídia com `require_human_for_media = true` nunca é aprovada automaticamente.
- [ ] Descer de qualquer modo piloto para `ASSISTED` move itens `SCHEDULED`/`APPROVED` com `Approval.actor = SYSTEM` para `IN_REVIEW`, libera slot e emite evento com IDs; itens aprovados por humano não mudam.
- [ ] Mudar limiar cria nova `policyVersion` e auditoria.

## Fora de escopo

UI (T-045); aprendizado de limiares.

## Plano de teste

Supertest + Testcontainers com eventos simulados; tabela de casos por modo × gate.

## Riscos de segurança / compliance

Alto: é o controle que impede publicação indevida. Revisão de Sentinela obrigatória; testes de regressão fixos em CI.
