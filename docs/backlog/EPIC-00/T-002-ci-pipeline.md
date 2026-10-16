# T-002 · Pipeline de CI (GitHub Actions)

- Épico: EPIC-00 Foundation
- Responsável (papel/agente): Estaleiro (plataforma)
- Branch/floor: `ci/T-002-ci-pipeline`
- Estado: done (integrada em `main` via PR #65; `2a1cb1b` inclui `1efb51b`)
- Dependências: T-001; remote GitHub (decisão de Rodrigo, PRD §13.10) — sem remote, entregar os workflows e validar com `act` ou execução local equivalente

## Contexto

O DoD global exige lint, typecheck, testes, build e secret scanning verdes antes de qualquer tarefa ser considerada pronta.

## Resultado esperado

Workflows em `.github/workflows/`: `ci.yml` (lint, typecheck, test, build via Turborepo com cache) e `security.yml` (secret scanning, ex.: gitleaks; auditoria de dependências). Status obrigatório para PR em `main` documentado.

## Critérios de aceite (verificáveis)

- [x] PR de exemplo com erro de lint falha; PR limpo passa. (PR limpo: run real do PR desta tarefa; lint quebrado: validado localmente com o mesmo comando `pnpm turbo lint typecheck test build`, exit 1)
- [x] Commit contendo um segredo falso (fixture) é bloqueado pelo secret scanning. (fixture `ghp_…` commitada em clone descartável e detectada pelo mesmo script e versão do CI, `.github/scripts/gitleaks-scan.sh` com gitleaks 8.30.1: exit 2 com o segredo num commit do range, só no working tree, ou só na resolução de um merge; checksum adulterado aborta com exit 1)
- [x] Tempo de CI em cache quente ≤ 5 min para o monorepo vazio. (PR #65: job `check` 54 s e 62 s em cache frio; `commitlint` 16–22 s; `gitleaks` 10–14 s; `trivy` 26–30 s)
- [x] Documentado em `CONTRIBUTING.md` quais checks são obrigatórios.

## Fora de escopo

Deploy (T-056), Semgrep/Trivy com triagem (T-062, gate G-06), preview environments.

## Plano de teste

Dois PRs de teste (um quebrado, um limpo); commit com segredo fixture em branch descartável.

## Riscos de segurança / compliance

Segredos em CI só via GitHub Secrets; nenhum valor real em workflow. Permissões mínimas (`permissions:` por job).

## Entregue (2026-10-13)

- `.github/workflows/ci.yml`: jobs `check` (Node via `.nvmrc`, pnpm via `packageManager`, cache do store e do Turborepo, `pnpm install --frozen-lockfile`, `pnpm turbo lint typecheck test build`, `pnpm format:check`) e `commitlint` (commits do PR). Job `compose-smoke` deixado comentado com instruções; ativado em T-003.
- `.github/workflows/security.yml`: `gitleaks` via `.github/scripts/gitleaks-scan.sh` (CLI 8.30.1 com SHA-256 fixo; range do PR/push com merges + working tree; histórico completo no agendamento semanal e manual) e `trivy` fs (vuln + misconfig; todo HIGH/CRITICAL falha, triagem só por `.trivyignore` com owner e expiração). Alinhado ao gate G-06, que continua aberto; T-062 amplia com Semgrep, imagens e `scan-triage.md`.
- `.github/dependabot.yml`: npm e github-actions, semanal, agrupado, prefixos `build(deps)`/`ci(deps)` compatíveis com commitlint.
- Ressalvas de Atlas (T-001): R3 `engine-strict=true` em `.npmrc`; R4 `catalog` em `pnpm-workspace.yaml` para `typescript`, `eslint`, `vitest`, `@types/node` (+ `prettier`, pedido na revisão desta tarefa).
- `.gitleaksignore` com dois falsos positivos (placeholders em docs) por fingerprint.
- Actions pinadas por SHA (TM-21); `permissions: contents: read` por padrão; `persist-credentials: false` em todo checkout; nenhum secret necessário.
- Revisão estrutural de Atlas: APROVADO (R1–R5 aplicadas no commit `ci: apply Atlas review`). Revisão de Sentinela: solicitada duas vezes; o terminal dela (Codex, sem rede) travou em prompts de permissão e não emitiu veredito — pendente para o Maestro/Rodrigo.

## Pendências / decisões

- Branch protection com checks *required* não está disponível (repositório privado em plano gratuito); regra documentada em `CONTRIBUTING.md`.
- `docs/**` continua fora do `format:check`: 31 arquivos de outros papéis não estão formatados; cada dono formata na própria tarefa.
- `gitleaks-action` dispensa licença em conta pessoal; se o repositório migrar para organização, exige `GITLEAKS_LICENSE` (chave gratuita) ou troca pelo CLI.
