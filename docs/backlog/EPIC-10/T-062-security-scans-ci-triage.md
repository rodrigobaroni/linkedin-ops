# T-062 · Scans de segurança em CI (Semgrep, Trivy, gitleaks) com triagem documentada (gate G-06)

- Épico: EPIC-10 Security, Reliability & Deployment
- Responsável (papel/agente): Estaleiro (plataforma) · triagem com Sentinela
- Branch/floor: `ci/T-062-security-scans`
- Estado: todo
- Dependências: T-002, T-003

## Contexto

Gate G-06 do `docs/security/threat-model.md` §8 exige, antes de produção: varredura de secrets, Semgrep (SAST), Trivy (imagens e dependências) com triagem documentada, além do restore de backup cifrado (T-055). Finding SEC-005 (hardening do `.gitignore`) entra aqui.

## Resultado esperado

Workflow `security.yml` ampliado: gitleaks (já em T-002), Semgrep com regras OWASP/TypeScript + regra custom para log de objetos sensíveis (de T-052), Trivy em imagens de api/web/worker e em `pnpm-lock.yaml`; política de falha (critical/high bloqueiam; medium/low geram relatório); arquivo `docs/security/scan-triage.md` com formato de triagem (achado, decisão aceitar/corrigir, dono, data) e `.gitignore` revisado conforme SEC-005.

## Critérios de aceite (verificáveis)

- [ ] PR com vulnerabilidade high em dependência fixture falha; PR limpo passa.
- [ ] Achado medium aparece no relatório do PR sem bloquear.
- [ ] `scan-triage.md` contém ao menos a triagem da primeira execução real.
- [ ] Tempo adicional de CI ≤ 6 min com cache.
- [ ] `.gitignore` cobre os itens listados em SEC-005.

## Fora de escopo

DAST (ZAP) — opcional em T-057; Renovate/Dependabot (Fase 2).

## Plano de teste

PRs de teste com fixtures vulneráveis; revisão da triagem por Sentinela.

## Riscos de segurança / compliance

Tokens de ferramentas (Semgrep App) só via GitHub Secrets; execução em modo offline quando possível.
