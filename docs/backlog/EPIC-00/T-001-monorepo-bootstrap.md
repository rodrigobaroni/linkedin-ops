# T-001 · Bootstrap do monorepo (pnpm + Turborepo)

- Épico: EPIC-00 Foundation
- Responsável (papel/agente): Estaleiro (plataforma) · revisão Atlas
- Branch/floor: `chore/T-001-monorepo-bootstrap`
- Estado: review
- Dependências: nenhuma (commit base ea2f55b existe)

## Contexto

O repositório só tem docs. Toda a Onda 2 depende de um monorepo com a estrutura baseline do briefing (§6) e ferramentas compartilhadas. Stack aprovada: pnpm, Turborepo, TypeScript, ESLint, Prettier.

## Resultado esperado

Estrutura `apps/{web,api,worker}`, `packages/{contracts,editorial-engine,ui,config}`, `infra/{docker,caddy}`, `tests/{e2e,fixtures}` com `package.json` mínimos, `pnpm-workspace.yaml`, `turbo.json` (pipelines `lint`, `typecheck`, `test`, `build`), `tsconfig` base em `packages/config`, ESLint + Prettier compartilhados, Node LTS fixado (`.nvmrc`/`engines`).

## Critérios de aceite (verificáveis)

- [ ] `pnpm install && pnpm turbo lint typecheck build` executa sem erro em máquina limpa.
- [ ] Cada app/pacote tem `README.md` de uma linha e script `lint`/`typecheck` funcionando (mesmo que vazios de código).
- [ ] `packages/config` exporta `tsconfig.base.json`, config ESLint e Prettier reutilizados por todos os pacotes.
- [ ] `.gitignore` cobre `node_modules`, `.turbo`, `dist`, `.next`, `.env*` (exceto `.env.example`), uploads e exports.
- [ ] Nenhum código de domínio é criado nesta tarefa.

## Fora de escopo

CI (T-002), Docker (T-003), código de app, escolha de versões de framework além do fixado no briefing.

## Plano de teste

Clonar em diretório novo, rodar os comandos acima; checar `pnpm ls --depth 0` em cada workspace.

## Riscos de segurança / compliance

Baixo. Garantir que `.gitignore` e `.npmrc` não exponham tokens de registry.
