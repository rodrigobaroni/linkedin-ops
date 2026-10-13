# T-002 · Pipeline de CI (GitHub Actions)

- Épico: EPIC-00 Foundation
- Responsável (papel/agente): Estaleiro (plataforma)
- Branch/floor: `ci/T-002-ci-pipeline`
- Estado: todo
- Dependências: T-001; remote GitHub (decisão de Rodrigo, PRD §13.10) — sem remote, entregar os workflows e validar com `act` ou execução local equivalente

## Contexto

O DoD global exige lint, typecheck, testes, build e secret scanning verdes antes de qualquer tarefa ser considerada pronta.

## Resultado esperado

Workflows em `.github/workflows/`: `ci.yml` (lint, typecheck, test, build via Turborepo com cache) e `security.yml` (secret scanning, ex.: gitleaks; auditoria de dependências). Status obrigatório para PR em `main` documentado.

## Critérios de aceite (verificáveis)

- [ ] PR de exemplo com erro de lint falha; PR limpo passa.
- [ ] Commit contendo um segredo falso (fixture) é bloqueado pelo secret scanning.
- [ ] Tempo de CI em cache quente ≤ 5 min para o monorepo vazio.
- [ ] Documentado em `CONTRIBUTING.md` quais checks são obrigatórios.

## Fora de escopo

Deploy (T-056), Semgrep/Trivy com triagem (T-062, gate G-06), preview environments.

## Plano de teste

Dois PRs de teste (um quebrado, um limpo); commit com segredo fixture em branch descartável.

## Riscos de segurança / compliance

Segredos em CI só via GitHub Secrets; nenhum valor real em workflow. Permissões mínimas (`permissions:` por job).
