# T-007 · Shell do dashboard (Next.js App Router + shadcn/ui)

- Épico: EPIC-00 Foundation
- Responsável (papel/agente): Vitral (frontend) · revisão Aurora
- Branch/floor: `feat/T-007-web-app-shell`
- Estado: done (integrada em `main` via PR #67, merge commit `1130009`; revisões de Atlas, Sentinela, Aurora e Crivo concluídas)
- Dependências: T-001, T-011 (mapa de navegação), T-014 (tokens)

## Contexto

Todas as telas do MVP compartilham layout, navegação e infraestrutura de dados (TanStack Query, React Hook Form + Zod).

## Resultado esperado

`apps/web` com App Router, Tailwind + shadcn/ui, `packages/ui` com componentes base, layout com navegação (Hoje, Curadoria, Estúdio, Calendário, Histórico, Memória editorial, Fontes, Analytics, Notificações, Configurações), provider do TanStack Query, páginas placeholder com estados empty/loading/error padronizados, i18n mínimo (PT-BR) sem framework pesado. Guard de autenticação e cliente HTTP tipado a partir de `packages/contracts` ficam para quando T-015 e T-004 existirem (ver "Pendências").

## Critérios de aceite (verificáveis)

- [x] Navegação por teclado completa; foco visível; `axe` sem violações críticas nas páginas placeholder. _Evidência: testes Vitest com `axe-core` no shell e nas telas placeholder (`apps/web/src/components/shell/app-shell.test.tsx`, `placeholder-screen.test.tsx`); foco visível via `:focus-visible` global (ring 2 px + offset 2 px); drawer "Mais" com foco preso, Escape e retorno ao disparador (Radix Dialog)._
- [x] Layout responsivo (≥ 360 px) sem scroll horizontal. _Evidência: verificado em 320, 390, 768 e 1440 px (`scrollWidth ≤ innerWidth` em 320 px)._
- [ ] Usuário não autenticado é redirecionado para login. _Adiado: depende de T-015 (auth) e ADR-0007; o shell ficou em um route group `(app)` para que `/login` fique fora dele._
- [ ] Teste Playwright de smoke: abre cada rota e vê o título. _Adiado para T-059/T-060 (não instalar browsers nesta tarefa); coberto hoje por teste Vitest que garante `page.tsx` para cada rota exigida e por `metadata.title` em cada página._

## Entregue (2026-10-13)

- `packages/ui`: tokens de `design-tokens.md` como preset CSS do Tailwind v4 (`@linkedin-ops/ui/styles.css`), primitivos no estilo shadcn/ui (Button, Badge, Card, Skeleton, Alert, Separator, Sheet, Breadcrumb, Tooltip, Popover), padrões `EmptyState`/`LoadingState`/`ErrorState` e `AutonomyModeBadge` (três modos, ícone + texto). Consumido do fonte por `apps/web` (`transpilePackages`), sem etapa de build.
- `packages/config`: preset ESLint React (`@linkedin-ops/config/eslint/react`: react-hooks + jsx-a11y).
- `apps/web`: Next.js 16 App Router em PT-BR; skip link, sidebar desktop (256 px, recolhível para 72 px), rail de ícones em tablet, barra inferior + drawer "Mais" no mobile; cabeçalho com breadcrumb, `h1` (foco após navegação), descrição e sino; badge de autonomia sempre visível (sidebar/drawer + cabeçalho) que abre o popover "Entender o modo" (explicação, janela de cancelamento configurada, exceção de mídia) alimentado por provider **mockado**; rail de ícones com tooltips reais (hover + foco); provider do TanStack Query sem chamadas; 12 rotas placeholder com estados `?estado=vazio|carregando|erro` (prévia oculta em produção); `loading.tsx`, `error.tsx` e `not-found.tsx`; headers de segurança básicos (`nosniff`, `Referrer-Policy`, `X-Frame-Options`, CSP com `frame-ancestors 'none'`).

## Fora de escopo

Telas funcionais (épicos 02–06).

## Plano de teste

Vitest + Testing Library + axe-core (shell, navegação, estados). Playwright smoke e `axe` em browser real ficam para T-059/T-060. Checagem visual com Aurora.

## Pendências

- Guard de autenticação/redirect para login (T-015, ADR-0007).
- Cliente HTTP tipado e enum `AutonomyMode` importado de `@linkedin-ops/contracts` (T-004); hoje o tipo vive em `packages/ui/src/types/autonomy.ts` com os mesmos valores do `data-model.md`.
- Dados mockados em `apps/web/src/config/mock.ts` (status do LinkedIn, não lidas, nome da conta) e no `AutonomyModeProvider` (`mode`, `cancelWindowMinutes = 60`, `mediaRequiresHuman = true`, espelhando `AutonomySettings` de `contracts.md` §3.4).
- CSP estrita com nonce (T-057).
- `eslint-plugin-jsx-a11y` declara peer `eslint ≤ 9`; roda em ESLint 10 sem alterações (`strict-peer-dependencies=false`). Trocar quando o upstream ampliar a faixa.

## Riscos de segurança / compliance

Sem segredos no bundle (`NEXT_PUBLIC_*` só para valores públicos); CSP básica. Nenhum dado externo é renderizado como HTML.
