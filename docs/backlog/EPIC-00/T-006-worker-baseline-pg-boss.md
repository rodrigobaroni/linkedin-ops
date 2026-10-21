# T-006 · Worker base (pg-boss, retries, DLQ, agendador com timezone)

- Épico: EPIC-00 Foundation
- Responsável (papel/agente): Pêndulo (automação/integrações) · revisão Atlas
- Branch/floor: `feat/T-006-worker-baseline-pg-boss`
- Estado: todo
- Dependências: T-003, T-005

## Contexto

Coleta, geração, publicação e notificações rodam como jobs duráveis. O ciclo seg/qua/sex 09:00 `America/Sao_Paulo` e a publicação no slot exigem agendamento com timezone explícito e tolerância a reinício.

## Resultado esperado

`apps/worker` com bootstrap do pg-boss, convenção de nomes de jobs, política padrão de retry (exponencial, 3 tentativas), dead-letter (`*.failed`), `correlationId` propagado em logs, utilitário de cron com timezone (`America/Sao_Paulo`) e detecção de execução perdida (catch-up único), job de exemplo `heartbeat`.

## Critérios de aceite (verificáveis)

- [ ] Job que falha 3× vai para DLQ e gera log de erro com `correlationId`.
- [ ] Teste com relógio falso: cron `0 9 * * 1,3,5` em `America/Sao_Paulo` dispara nos horários corretos em UTC, inclusive em semana de virada de ano.
- [ ] Worker reiniciado às 09:05 executa o ciclo perdido das 09:00 uma única vez (singleton key).
- [ ] Health endpoint do worker reporta conexão com a fila.

## Fora de escopo

Jobs de domínio (coleta T-025, geração T-033, publicação T-042).

## Plano de teste

Vitest com Testcontainers para pg-boss; relógio falso para o cron; teste de reinício.

## Riscos de segurança / compliance

Payload de job nunca contém tokens ou texto de fonte bruto (só IDs).

Imagem Docker (Estaleiro, revisão do PR #80): `apps/worker/Dockerfile` copia para o runtime só
`packages/contracts/dist` e `apps/worker/dist`; ao depender de `@linkedin-ops/domain` e
`@linkedin-ops/editorial-engine`, acrescentar os `COPY --from=build` correspondentes ou migrar para
`pnpm deploy --prod --filter @linkedin-ops/worker`. Hoje o placeholder encerra logo após iniciar; o
`compose-smoke` só exige que a imagem de runtime saia com código 0.
