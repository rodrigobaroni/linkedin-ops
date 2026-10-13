# T-042 · Scheduler de publicação no slot e tratamento de falhas

- Épico: EPIC-05 Scheduling & LinkedIn Publishing
- Responsável (papel/agente): Pêndulo (automação/integrações)
- Branch/floor: `feat/T-042-publishing-scheduler`
- Estado: todo
- Dependências: T-006, T-039, T-041

## Contexto

No horário agendado, enfileirar `publication.publish` exatamente uma vez; tolerar reinício; expor retentar/reagendar após `FAILED`; DLQ e alerta.

## Resultado esperado

Job periódico `schedule.dispatch` (a cada minuto) que seleciona `Schedule` vencidos e ainda não despachados com lock (`SELECT … FOR UPDATE SKIP LOCKED`) e enfileira publicação com singleton key por `scheduleId` (em `AUTOPILOT_CONTROLLED`, só se `now ≥ notifiedAt + cancel_window_minutes`; caso contrário adia e registra); endpoint `POST /content-items/:id/retry-publish` (de `FAILED`); job de recuperação após downtime (slots perdidos são executados se dentro de 2 h; além disso, `FAILED` com motivo "slot perdido durante indisponibilidade").

## Critérios de aceite (verificáveis)

- [ ] Dois workers concorrentes não despacham o mesmo slot (teste com 2 instâncias).
- [ ] Slot vencido com janela de cancelamento ainda não decorrida é adiado, não publicado (teste com relógio falso).
- [ ] Reinício de 10 min cobre slots perdidos sem duplicar.
- [ ] Publicação executada em ≤ 5 min do horário em teste de carga leve.
- [ ] `FAILED` → retry manual reusa a mesma `idempotencyKey` se a versão não mudou.

## Fora de escopo

UI (T-043).

## Plano de teste

Testcontainers com relógio falso e 2 workers.

## Riscos de segurança / compliance

Duplicação; publicação fora do modo (revalidação em T-039).
