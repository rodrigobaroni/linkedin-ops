# Contributing

## Idiomas

- Código, identificadores, branches, commits, schemas e APIs: **inglês**.
- Interface inicial e documentos de produto: **português brasileiro**.
- ADRs e documentação estritamente técnica: inglês permitido.

## Branches

Uma tarefa por branch/floor. Padrão:

- `feat/<issue>-<slug>`
- `fix/<issue>-<slug>`
- `chore/<issue>-<slug>`
- `docs/<issue>-<slug>`

`<issue>` é o ID da tarefa (GitHub Issue ou `docs/backlog/`), ex.: `feat/T-012-opportunity-ranking`.
Nunca faça push direto em `main`. Nunca sobrescreva trabalho alheio.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/): `type(scope): subject`.
Tipos: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`, `build`, `perf`, `security`, `revert`.
Validado localmente pelo hook `commit-msg` (husky + commitlint, `commitlint.config.js`); o hook é
instalado por `pnpm install`. Reverts devem ser escritos como `revert: <subject>`: a mensagem
`Revert "..."` gerada pelo botão do GitHub falha no `type-enum` e precisa ser reescrita antes do PR.

## Ferramentas

- Node 24 LTS (`.nvmrc`) e pnpm 10 (`packageManager`). Turborepo orquestra `lint`, `typecheck`, `test` e `build`.
- Configuração compartilhada em `packages/config` (tsconfig, ESLint flat config, Prettier, Vitest).
  Cada workspace só estende essas bases; regras novas entram lá, com revisão de Atlas.
- Antes de abrir PR: `pnpm check` e `pnpm format:check`.
- Versões de `typescript`, `eslint`, `vitest` e `@types/node` vivem no `catalog` de `pnpm-workspace.yaml`;
  os workspaces referenciam `"catalog:"`. `engine-strict=true` (`.npmrc`) bloqueia Node/pnpm fora de `engines`.

## CI e checks obrigatórios

Workflows em `.github/workflows/` (Actions pinadas por SHA; Dependabot atualiza semanalmente).
Um PR só pode ser integrado em `main` com **todos** os checks abaixo verdes:

| Check                                        | Workflow / job              | O que valida                                                                                     |
| -------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------ |
| `CI / Lint, typecheck, test, build`          | `ci.yml` → `check`          | `pnpm install --frozen-lockfile`, `pnpm turbo lint typecheck test build`, `pnpm format:check`    |
| `CI / Conventional Commits`                  | `ci.yml` → `commitlint`     | todas as mensagens de commit do PR (`commitlint.config.js`)                                      |
| `Security / Secret scanning (gitleaks)`      | `security.yml` → `gitleaks` | segredos nos commits do PR (gate G-06); falsos positivos só via fingerprint em `.gitleaksignore` |
| `Security / Dependencies and config (Trivy)` | `security.yml` → `trivy`    | vulnerabilidades em `pnpm-lock.yaml` e misconfig em `infra/`; HIGH/CRITICAL falham               |

O repositório é privado em plano gratuito, então o GitHub não permite branch protection/rulesets:
a obrigatoriedade é regra do time (o Maestro/Rodrigo só integra floors com checks verdes). Quando o
plano permitir, habilitar branch protection em `main` com esses quatro checks como _required_.

Reproduzir localmente: `pnpm check && pnpm format:check`, `pnpm exec commitlint --from main --verbose`,
`gitleaks git .` (`brew install gitleaks`), `actionlint` para validar os workflows.
Nenhum secret é necessário nos workflows; nunca coloque valores reais em arquivos de workflow.

## Definition of Done

Uma tarefa só está pronta quando:

- Critérios de aceite cumpridos.
- Testes relevantes passam; typecheck, lint e build passam.
- Nenhum segredo ou dado pessoal indevido no diff.
- Error handling e logs úteis.
- Alterações de schema têm migration e rollback/documentação.
- Acessibilidade considerada para UI.
- Documentação e contratos atualizados.
- Architect revisou mudanças estruturais; Security revisou alterações sensíveis.
- QA produziu evidência proporcional ao risco.
- Relatório com arquivos, comandos, testes, riscos e pendências.
- Floor em `review`, nunca landed automaticamente.

## Decisões técnicas

Mudanças na stack-base ou na estrutura exigem ADR em `docs/adr/` (template em `docs/adr/0000-template.md`).
