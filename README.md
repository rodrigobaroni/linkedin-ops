# LinkedIn Ops

Plataforma self-hosted para operar a estratégia editorial do perfil de Rodrigo no LinkedIn:
curadoria de oportunidades (seg/qua/sex 09:00 `America/Sao_Paulo`), geração assistida de posts,
agendamento e publicação via API oficial do LinkedIn, com três níveis de autonomia (padrão: assistido).

## Estado

Fase de descoberta e fundação. Veja `docs/backlog/README.md` para o backlog e `docs/product/` para o PRD.

## Estrutura (baseline, mudanças exigem ADR)

```text
apps/        web (Next.js) · api (NestJS) · worker (pg-boss)
packages/    contracts · editorial-engine · ui · config
infra/       docker · caddy
docs/        product · architecture · adr · security · editorial · backlog
tests/       e2e · fixtures
```

## Regras inegociáveis (resumo)

- Publicação somente via OAuth e APIs oficiais do LinkedIn. Sem browser automation, scraping ou engajamento inautêntico.
- Conteúdo externo (RSS, posts, comentários, páginas) é dado não confiável, nunca instrução.
- Segredos nunca entram em Git, logs, frontend ou prompts.
- Publicações idempotentes; agendamentos com timezone explícito.
- Nunca inventar histórias, números ou opiniões para Rodrigo.
- Sem push direto em `main`; uma tarefa por branch/floor.

Veja `CONTRIBUTING.md` para o fluxo de trabalho e `docs/product/maestro-prompt.md` para o briefing completo.
