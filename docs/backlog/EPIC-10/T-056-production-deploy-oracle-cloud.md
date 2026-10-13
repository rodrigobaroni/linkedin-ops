# T-056 · Deploy de produção (Oracle Cloud, Docker Compose, Caddy com TLS)

- Épico: EPIC-10 Security, Reliability & Deployment
- Responsável (papel/agente): Estaleiro (plataforma) · revisão Sentinela
- Branch/floor: `chore/T-056-production-deploy`
- Estado: todo
- Dependências: T-002, T-003, T-054, T-055; acesso à conta Oracle Cloud (Rodrigo)

## Contexto

Marco M5. Instância na Oracle Cloud com Compose, Caddy (TLS automático), segredos via `.env` fora do Git, migrations no deploy, rollback documentado.

## Resultado esperado

`infra/` com Compose de produção, Caddyfile com domínio real (variável), script/Action de deploy (build de imagens, push, `compose pull && up`, migrations), checklist de hardening do host (firewall, SSH por chave, atualizações), runbook de rollback (imagem anterior + migration down quando aplicável), monitoramento básico.

## Critérios de aceite (verificáveis)

- [ ] Deploy do zero em instância limpa segue o runbook sem passos manuais não documentados.
- [ ] HTTPS válido; HTTP redireciona; portas internas não expostas.
- [ ] Rollback para a versão anterior testado uma vez.
- [ ] Nenhum segredo em Git/CI logs; `.env` com permissões 600.

## Fora de escopo

Staging separado (Fase 2); CDN.

## Plano de teste

Deploy em instância de teste; scan de portas; verificação TLS.

## Riscos de segurança / compliance

Exposição pública do dashboard: rate limit e cabeçalhos de segurança (T-057) devem estar presentes antes do go-live.
