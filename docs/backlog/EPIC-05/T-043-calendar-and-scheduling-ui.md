# T-043 · UI de Calendário e agendamento

- Épico: EPIC-05 Scheduling & LinkedIn Publishing
- Responsável (papel/agente): Vitral (frontend) · revisão Aurora
- Branch/floor: `feat/T-043-calendar-scheduling-ui`
- Estado: todo
- Dependências: T-007, T-013, T-036, T-041, T-042

## Contexto

J3 passos 2–5 e J4: agendar com slot sugerido, visualização semanal/mensal, reagendar, desagendar, status de publicação, falhas com ações.

## Resultado esperado

Tela Calendário (semana/mês) com itens por estado, slot sugerido, seletor de data/hora mostrando timezone IANA e UTC, reagendar (formulário; arrastar-e-soltar é corte), desagendar, item em falha com motivo e ações Retentar/Editar/Descartar; no Estúdio, botão Agendar abrindo o mesmo seletor; Início mostra "próximas publicações" e "publicados esta semana" com link para o post.

## Critérios de aceite (verificáveis)

- [ ] Confirmação exibe horário local e UTC.
- [ ] Slot no passado é bloqueado com mensagem.
- [ ] Item `FAILED` mostra motivo e Retentar funciona.
- [ ] Playwright cobre agendar/reagendar/desagendar; `axe` sem violações críticas.

## Fora de escopo

Arrastar-e-soltar (MVP corte).

## Plano de teste

Playwright + componente; teste de formatação de timezone.

## Riscos de segurança / compliance

Nenhum adicional.
