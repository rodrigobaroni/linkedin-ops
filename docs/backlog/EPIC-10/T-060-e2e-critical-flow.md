# T-060 · E2E do fluxo crítico (curadoria → publicação) com fakes

- Épico: EPIC-10 Security, Reliability & Deployment
- Responsável (papel/agente): Crivo (QA)
- Branch/floor: `test/T-060-e2e-critical-flow`
- Estado: todo
- Dependências: T-059, T-030, T-036, T-043, T-039, T-047, T-044

## Contexto

Critério de saída do MVP (PRD §5): ciclo completo em modo assistido sem duplicação nem publicação fora do modo. Também cobre o modo completo com gate falhando e a troca de modo.

## Resultado esperado

Playwright + Compose (api, web, worker, postgres, minio, fakes): cenário A assistido (lote → selecionar → rascunho → editar → aprovar → agendar → relógio avança → publicado → Telegram fake recebeu); cenário B falha de publicação com retry e reconciliação sem duplicata; cenário C piloto automático controlado: aprovação automática, `AUTOPILOT_WILL_PUBLISH`, cancelar dentro da janela impede publicação; cenário C2 controlado sem cancelamento publica após a janela; cenário C3 gate G5 falhando ou versão com mídia → `IN_REVIEW`; cenário D descer de modo revoga aprovação automática; cenário E token expirado bloqueia publicação. Roda em CI (nightly se lento).

## Critérios de aceite (verificáveis)

- [ ] Cenários A–E (incl. C2/C3) verdes em CI com evidência (trace/vídeo).
- [ ] Cenário B prova exatamente 1 post no fake após falha + retry.
- [ ] Tempo total ≤ 15 min.
- [ ] Qualquer falha indica o passo e o `correlationId`.
- [ ] Suíte roda em browser real (Playwright + Chromium, não jsdom); `@axe-core/playwright` executa nas telas do fluxo A e inclui a regra de contraste (`color-contrast`), que o axe em jsdom não cobre (Crivo).
- [ ] O placeholder `echo` de `tests/e2e` foi substituído; CI falha se a suíte não encontrar testes.

## Fora de escopo

Teste com LinkedIn real (manual, documentado em T-056).

## Plano de teste

É o próprio teste; revisão de Atlas sobre cobertura.

## Riscos de segurança / compliance

Fakes nunca apontam para APIs reais em CI.

## Ressalvas (Crivo, 2026-10-16)

- Até esta tarefa, `tests/e2e` só ecoa uma mensagem; o check verde do workspace não é evidência de E2E.
- Verificações de acessibilidade com contraste só valem em browser real; jsdom (T-007/T-014 unit) não as cobre.
