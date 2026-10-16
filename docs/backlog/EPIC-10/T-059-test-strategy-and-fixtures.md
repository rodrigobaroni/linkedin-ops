# T-059 · Estratégia de testes, fixtures e fault injection

- Épico: EPIC-10 Security, Reliability & Deployment
- Responsável (papel/agente): Crivo (QA)
- Branch/floor: `test/T-059-test-strategy`
- Estado: todo
- Dependências: T-001, T-004

## Contexto

DoD global exige evidência proporcional ao risco. Cenários de J8 (LinkedIn fora, token expirado, OpenAI falhou, JSON inválido, post duplicado, timezone, reinício) precisam de infraestrutura comum: fakes de LinkedIn/OpenAI/Telegram, servidor de feeds, relógio falso, Testcontainers.

## Resultado esperado

`docs/testing/strategy.md` (pirâmide, o que roda em CI vs. sob flag, critérios por risco), pacote `tests/fixtures` com feeds (válidos, maliciosos, enormes), fakes com injeção de falhas configurável (`LinkedInFake`, `OpenAIFake`, `TelegramFake`), utilitário de relógio falso para `America/Sao_Paulo`, matriz de cenários J8 ↔ tarefa ↔ teste; verificação de que as dependências do backlog não têm ciclos (script simples).

## Critérios de aceite (verificáveis)

- [ ] Fakes usados por ao menos T-033, T-039, T-046 (checklist).
- [ ] Matriz J8 completa com dono do teste por cenário.
- [ ] Fixtures maliciosas incluem XML bomb, `<script>`, URLs internas, instruções injetadas.
- [ ] Script de verificação de ciclos no backlog roda em CI (docs).
- [ ] `tests/e2e` deixa de ser placeholder: o script `test` hoje é um `echo` (T-001); esta tarefa instala Playwright com browsers reais (Chromium no mínimo) e o `pnpm turbo test` passa a executar a suíte, ainda que vazia, em vez de ecoar.
- [ ] A estratégia documenta que verificação de contraste/acessibilidade não roda em jsdom: axe em jsdom não cobre contraste de cor; esses checks pertencem ao Playwright em browser real (T-060), e o unit/jsdom cobre só regras estruturais.

## Fora de escopo

E2E (T-060).

## Plano de teste

Os próprios fakes têm testes.

## Riscos de segurança / compliance

Fixtures sem dados pessoais reais.

## Ressalvas (Crivo, revisão dos PRs #67/#68, 2026-10-16)

- `tests/e2e` é placeholder (`test` = `echo`); nada E2E roda em CI até esta tarefa e T-060. Não considerar critérios de T-060 cumpridos por checks verdes do workspace vazio.
- axe-core em jsdom não avalia contraste (sem layout/cores computadas). Contraste e foco visível são verificados com `@axe-core/playwright` em browser real, dentro de T-060.
