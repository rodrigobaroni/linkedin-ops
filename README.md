# LinkedIn Ops

Plataforma self-hosted para operar a estratégia editorial do perfil de Rodrigo no LinkedIn:
curadoria de oportunidades (seg/qua/sex 09:00 `America/Sao_Paulo`), geração assistida de posts,
agendamento e publicação via API oficial do LinkedIn, com três níveis de autonomia (padrão: assistido).

## Estado

Fase de descoberta e fundação. Veja `docs/backlog/README.md` para o backlog e `docs/product/` para o PRD.

## Como rodar (desenvolvimento)

Pré-requisitos: Node.js 24 LTS (`.nvmrc`) e pnpm 10 (`packageManager` em `package.json`; `corepack enable`
ou `npm i -g pnpm`). Para a infraestrutura local, Docker Engine com Compose v2 (detalhes em
`infra/docker/README.md`).

```bash
pnpm install                     # instala o workspace e ativa os hooks do husky
pnpm check                       # lint + typecheck + test + build em todos os workspaces (Turborepo)
pnpm lint | pnpm typecheck | pnpm test | pnpm build
pnpm format                      # Prettier (config compartilhada em packages/config)
pnpm --filter @linkedin-ops/api <script>   # rodar um script em um workspace específico
```

Infraestrutura local (Docker Compose, T-003):

```bash
cp .env.example .env             # placeholders e defaults de dev; nunca commitar o .env
pnpm dev:infra                   # postgres 17 + object storage S3-compatible (bucket criado) com health checks
pnpm dev:stack                   # stack completa: api, worker, web e Caddy em https://localhost (TLS interno)
pnpm dev:infra:down              # para a infra (volumes preservados)
```

## Estrutura (baseline, mudanças exigem ADR)

```text
apps/        web (Next.js) · api (NestJS) · worker (pg-boss)
packages/    contracts · editorial-engine · domain (proposto, ADR-0001) · ui · config
infra/       docker · caddy
docs/        product · architecture · adr · security · editorial · backlog
tests/       e2e · fixtures
```

Todos os workspaces usam o escopo npm `@linkedin-ops/*` e compartilham `tsconfig`, ESLint, Prettier e
Vitest de `packages/config`. Responsabilidades de cada pacote: `docs/adr/0001-monorepo-and-base-stack.md`.

## Regras inegociáveis (resumo)

- Publicação somente via OAuth e APIs oficiais do LinkedIn. Sem browser automation, scraping ou engajamento inautêntico.
- Conteúdo externo (RSS, posts, comentários, páginas) é dado não confiável, nunca instrução.
- Segredos nunca entram em Git, logs, frontend ou prompts.
- Publicações idempotentes; agendamentos com timezone explícito.
- Nunca inventar histórias, números ou opiniões para Rodrigo.
- Sem push direto em `main`; uma tarefa por branch/floor.

Veja `CONTRIBUTING.md` para o fluxo de trabalho e `docs/product/maestro-prompt.md` para o briefing completo.
