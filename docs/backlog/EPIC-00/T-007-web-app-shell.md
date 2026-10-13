# T-007 · Shell do dashboard (Next.js App Router + shadcn/ui)

- Épico: EPIC-00 Foundation
- Responsável (papel/agente): Vitral (frontend) · revisão Aurora
- Branch/floor: `feat/T-007-web-app-shell`
- Estado: todo
- Dependências: T-001, T-011 (mapa de navegação), T-014 (tokens)

## Contexto

Todas as telas do MVP compartilham layout, navegação e infraestrutura de dados (TanStack Query, React Hook Form + Zod).

## Resultado esperado

`apps/web` com App Router, Tailwind + shadcn/ui, `packages/ui` com componentes base, layout com navegação (Início, Curadoria, Estúdio, Calendário, Memória editorial, Fontes, Configurações, Auditoria), guard de autenticação, provider do TanStack Query, cliente HTTP tipado a partir de `packages/contracts`, páginas placeholder com estados empty/loading/error padronizados, i18n mínimo (PT-BR) sem framework pesado.

## Critérios de aceite (verificáveis)

- [ ] Navegação por teclado completa; foco visível; `axe` sem violações críticas nas páginas placeholder.
- [ ] Layout responsivo (≥ 360 px) sem scroll horizontal.
- [ ] Usuário não autenticado é redirecionado para login.
- [ ] Teste Playwright de smoke: abre cada rota e vê o título.

## Fora de escopo

Telas funcionais (épicos 02–06).

## Plano de teste

Playwright smoke; `axe-core` nas rotas; checagem visual com Aurora.

## Riscos de segurança / compliance

Sem segredos no bundle (`NEXT_PUBLIC_*` só para valores públicos); CSP básica.
