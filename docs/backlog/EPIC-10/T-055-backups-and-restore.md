# T-055 · Backups do Postgres e do storage com restore testado

- Épico: EPIC-10 Security, Reliability & Deployment
- Responsável (papel/agente): Estaleiro (plataforma)
- Branch/floor: `chore/T-055-backups-restore`
- Estado: todo
- Dependências: T-003

## Contexto

Self-hosted: perda do banco significa perda de Story Bank, histórico e auditoria. Backup diário, retenção, restore documentado e testado; após restore, publicações com URN não se repetem (reconciliação de T-039).

## Resultado esperado

Serviço no Compose (ou cron no host) para `pg_dump` diário cifrado + sincronização do bucket; retenção 30 dias; script `restore.sh` com verificação; runbook em `docs/security/backup-restore.md`; teste de restore em ambiente limpo com evidência.

## Critérios de aceite (verificáveis)

- [ ] Backup diário gerado e cifrado; listagem mostra os últimos 30.
- [ ] Restore em Compose limpo sobe a aplicação e os dados conferem (checksum de tabelas) — parte do gate G-06 (threat-model §8), com evidência.
- [ ] Runbook com RTO/RPO alvo (hipótese: RPO 24 h, RTO 2 h).
- [ ] Credenciais de backup fora do Git.

## Fora de escopo

Backup contínuo/PITR.

## Plano de teste

Execução do runbook com evidência anexada.

## Riscos de segurança / compliance

Backups contêm tokens cifrados e dados pessoais: cifrar e restringir acesso.
