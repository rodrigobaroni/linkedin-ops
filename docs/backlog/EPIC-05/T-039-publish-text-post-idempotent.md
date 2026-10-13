# T-039 · Publicação de post de texto com idempotência e reconciliação

- Épico: EPIC-05 Scheduling & LinkedIn Publishing
- Responsável (papel/agente): Pêndulo (automação/integrações) · mecanismo de idempotência com Atlas
- Branch/floor: `feat/T-039-publish-text-post`
- Estado: todo
- Dependências: T-038, T-032, T-006

## Contexto

Regra inegociável: um retry nunca gera post duplicado (PRD §8.2). Publicação exige versão aprovada e verificação do modo no momento da execução.

## Resultado esperado

Job `publication.publish` (`SCHEDULED → PUBLISHING → PUBLISHED|FAILED`): cria `Publication` com `idempotencyKey = hash(contentItemId, contentVersionId, scheduleId)` **antes** de chamar a API (índice único); revalida versão aprovada, modo, token e, em `AUTOPILOT_CONTROLLED`, que `cancel_window_minutes` decorreu desde `notifiedAt` (senão adia); chama a API oficial de posts; grava `linkedinPostUrn`; em timeout/erro ambíguo **não há retry automático**: item vai para `FAILED` com `needs_reconciliation` e alerta; job `publication.reconcile` (manual ou por alerta) consulta `Publication`/URN antes de qualquer nova tentativa (ADR-0003); retries 3× (1/5/15 min) só para erros claramente transitórios antes do envio; erros de conteúdo → `FAILED` imediato com motivo em PT-BR; eventos `publication.succeeded|failed`.

## Critérios de aceite (verificáveis)

- [ ] Fault injection "API aceitou, resposta perdida" + retry → exatamente 1 post no fake e estado `PUBLISHED`.
- [ ] Worker reiniciado durante `PUBLISHING` → ao retomar, não duplica.
- [ ] Versão desaprovada entre agendamento e execução → aborta para `IN_REVIEW` com evento.
- [ ] Token expirado → `FAILED` com motivo "LinkedIn desconectado" e evento.
- [ ] Rate limit (429) respeita `Retry-After`.
- [ ] **Gate G-04 (threat-model §8):** teste de publicação concorrente (2 workers, mesmo schedule) e de timeout prova no máximo um post ou estado `AMBIGUOUS` sem retry cego; evidência anexada ao PR.

## Fora de escopo

Mídia (T-040), agendamento (T-041/T-042).

## Plano de teste

Testcontainers + `LinkedInClient` fake com injeção de falhas; teste de reinício.

## Riscos de segurança / compliance

Duplicação; publicação fora do modo; uso apenas de endpoints oficiais.
