# T-036 · UI de versões (diff, restaurar) e aprovação

- Épico: EPIC-04 Draft Studio
- Responsável (papel/agente): Vitral (frontend)
- Branch/floor: `feat/T-036-version-history-approval-ui`
- Estado: todo
- Dependências: T-035

## Contexto

J2 passo 4 e J3 passos 1 e 5: histórico de versões com diff e restaurar; aprovar versão com resumo de gates; aviso "editar revoga aprovação"; exibição da razão de aprovação automática.

## Resultado esperado

Aba Versões (lista com autor, horário, instrução, diff entre duas selecionadas, Restaurar), botão Aprovar esta versão com diálogo-resumo, banner de estado (aprovado/agendado/publicado/falhou), tela de razão da aprovação (humana ou política, com gates e valores), ação Descartar com confirmação.

## Critérios de aceite (verificáveis)

- [ ] Diff legível em mobile; restaurar cria nova versão (não altera histórico).
- [ ] Editar em `APPROVED` mostra o aviso e, ao confirmar, o banner muda para "em revisão".
- [ ] Razão de aprovação automática mostra cada gate com valor e limiar.
- [ ] Playwright cobre aprovar, editar após aprovar, restaurar.

## Fora de escopo

Agendamento (T-043).

## Plano de teste

Playwright + componente.

## Riscos de segurança / compliance

Nenhum adicional.
