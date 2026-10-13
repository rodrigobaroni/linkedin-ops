# T-028 · Ciclo de curadoria seg/qua/sex 09:00 e seleção das 5 oportunidades

- Épico: EPIC-03 Sources & Opportunities
- Responsável (papel/agente): Pêndulo (automação/integrações) · regras de diversidade com Pena
- Branch/floor: `feat/T-028-curation-cycle-and-batch`
- Estado: todo
- Dependências: T-006, T-025, T-026, T-027, T-029

## Contexto

Orquestra o pipeline (PRD §7.1–7.2): coleta → cluster → classificar → selecionar 5 com diversidade → publicar lote → expirar lote anterior → notificar. Deve ser tolerante a reinício e nunca produzir dois lotes para o mesmo ciclo.

## Resultado esperado

Cron `0 9 * * 1,3,5` em `America/Sao_Paulo` com catch-up único; job `curation.run` com singleton por (`userId`, data do ciclo); seleção com restrições (máx. 2 por pilar, máx. 2 por fonte, 1 "quente" se houver, exclusão de clusters vistos em 30 dias salvo atualização), preenchimento abaixo do limiar marcado (decisão pendente PRD §13.1); expiração de `candidate` do lote anterior; lote `manual` via endpoint "rodar agora" (limite 1/h); emissão de eventos `curation.ready` / `curation.failed`.

## Critérios de aceite (verificáveis)

- [ ] Com relógio falso, 3 ciclos semanais criam exatamente 3 lotes; reinício do worker no meio não duplica.
- [ ] Lote respeita restrições de diversidade em fixture que as violaria sem restrição.
- [ ] Ao criar o lote de quarta, os `candidate` de segunda ficam `expired`.
- [ ] Falha após 3 tentativas emite `curation.failed` com motivo e não publica lote parcial.
- [ ] Lote pronto em ≤ 10 min para 50 fontes / 2 000 itens (fixture).

## Fora de escopo

UI (T-030), notificação Telegram (T-047 consome o evento).

## Plano de teste

Testcontainers + relógio falso; fault injection no coletor e no classificador.

## Riscos de segurança / compliance

Nenhum adicional; payloads só com IDs.
