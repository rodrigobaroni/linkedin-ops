# T-002 · Pipeline de CI (GitHub Actions)

- Épico: EPIC-00 Foundation
- Responsável (papel/agente): Estaleiro (plataforma)
- Branch/floor: `ci/T-002-ci-pipeline`
- Estado: review (PR aberto; checks validados no run real)
- Dependências: T-001; remote GitHub (decisão de Rodrigo, PRD §13.10) — sem remote, entregar os workflows e validar com `act` ou execução local equivalente

## Contexto

O DoD global exige lint, typecheck, testes, build e secret scanning verdes antes de qualquer tarefa ser considerada pronta.

## Resultado esperado

Workflows em `.github/workflows/`: `ci.yml` (lint, typecheck, test, build via Turborepo com cache) e `security.yml` (secret scanning, ex.: gitleaks; auditoria de dependências). Status obrigatório para PR em `main` documentado.

## Critérios de aceite (verificáveis)

- [x] PR de exemplo com erro de lint falha; PR limpo passa. (PR limpo: run real do PR desta tarefa; lint quebrado: validado localmente com o mesmo comando `pnpm turbo lint typecheck test build`, exit 1)
- [x] Commit contendo um segredo falso (fixture) é bloqueado pelo secret scanning. (gitleaks 8.30 local: fixture `ghp_…` detectada, exit 2; mesmo binário/config que o `gitleaks-action` executa em CI)
- [x] Tempo de CI em cache quente ≤ 5 min para o monorepo vazio. (ver tempos do run do PR no relatório)
- [x] Documentado em `CONTRIBUTING.md` quais checks são obrigatórios.

## Fora de escopo

Deploy (T-056), Semgrep/Trivy com triagem (T-062, gate G-06), preview environments.

## Plano de teste

Dois PRs de teste (um quebrado, um limpo); commit com segredo fixture em branch descartável.

## Riscos de segurança / compliance

Segredos em CI só via GitHub Secrets; nenhum valor real em workflow. Permissões mínimas (`permissions:` por job).

## Entregue (2026-10-13)

- `.github/workflows/ci.yml`: jobs `check` (Node via `.nvmrc`, pnpm via `packageManager`, cache do store e do Turborepo, `pnpm install --frozen-lockfile`, `pnpm turbo lint typecheck test build`, `pnpm format:check`) e `commitlint` (commits do PR). Job `compose-smoke` deixado comentado com instruções; ativado em T-003.
- `.github/workflows/security.yml`: `gitleaks` (commits do PR / push em `main`; histórico completo no agendamento semanal e manual) e `trivy` fs (vuln + misconfig, HIGH/CRITICAL falham). Alinhado ao gate G-06; T-062 amplia com Semgrep, imagens e triagem.
- `.github/dependabot.yml`: npm e github-actions, semanal, agrupado, prefixos `build(deps)`/`ci(deps)` compatíveis com commitlint.
- Ressalvas de Atlas (T-001): R3 `engine-strict=true` em `.npmrc`; R4 `catalog` em `pnpm-workspace.yaml` para `typescript`, `eslint`, `vitest`, `@types/node`.
- `.gitleaksignore` com dois falsos positivos (placeholders em docs) por fingerprint.
- Actions pinadas por SHA (TM-21); `permissions: contents: read` por padrão; nenhum secret necessário.

## Pendências / decisões

- Branch protection com checks *required* não está disponível (repositório privado em plano gratuito); regra documentada em `CONTRIBUTING.md`.
- `docs/**` continua fora do `format:check`: 31 arquivos de outros papéis não estão formatados; cada dono formata na própria tarefa.
- `gitleaks-action` dispensa licença em conta pessoal; se o repositório migrar para organização, exige `GITLEAKS_LICENSE` (chave gratuita) ou troca pelo CLI.

