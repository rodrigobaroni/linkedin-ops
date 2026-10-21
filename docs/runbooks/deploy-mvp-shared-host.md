# Deploy do MVP-0 em host com proxy compartilhado (VM Oracle do Rodrigo)

Decisão de 2026-10-21: o MVP-0 roda na VM Oracle que já hospeda outros serviços atrás de um Caddy próprio
(stack do n8n). Por isso o Caddy da nossa stack fica desligado e o Caddy existente ganha um bloco de site.
Domínio: `linkedin.baroni.dedyn.io` (registro A na deSEC apontando para o IP reservado da VM).

## Peças

- `infra/docker/docker-compose.shared-proxy.yml`: desliga nosso `caddy` e o `worker`; publica `web` e `api`
  só em `172.17.0.1:3100/3101` (bridge do Docker, nunca interface pública).
- `infra/caddy/shared-proxy.site.caddy.example`: bloco de site com os mesmos cabeçalhos de segurança e o
  filtro de access log (sem `code`/`state`/tokens/cookies) do `infra/caddy/Caddyfile`.
- `infra/deploy/deploy-shared-host.sh`: `init-env` (cria `~/linkedin-ops/.env` 0600 na VM, segredos gerados
  lá; credenciais do LinkedIn vão por stdin), `escrow-key` (cópia da `ENCRYPTION_KEY` no Keychain do Mac),
  `deploy [ref]` (git archive via SSH, build na VM, migrations, sobe api+web, health), `status`.
- `infra/deploy/backup-db.sh` + `infra/deploy/backup-offsite.sh`: dump diário cifrado com a chave GPG
  PÚBLICA do Mac (a VM não consegue decifrar), cópia para `~/Backups/linkedin-ops` no Mac e teste de
  restore real em container descartável.

## Primeira vez (ordem)

1. deSEC: registro A `linkedin.baroni.dedyn.io` → IP da VM. Portal do LinkedIn: redirect
   `https://linkedin.baroni.dedyn.io/api/v1/auth/linkedin/callback`.
2. `export DEPLOY_HOST=ubuntu@<ip> DEPLOY_SSH_KEY=<chave> APP_HOST=linkedin.baroni.dedyn.io`
3. `infra/deploy/deploy-shared-host.sh init-env` e `infra/deploy/deploy-shared-host.sh escrow-key`
4. `infra/deploy/deploy-shared-host.sh deploy origin/main`
5. Caddy existente: acrescentar o bloco do `.example` (hostname real), `caddy validate` e `caddy reload`
   (backup do Caddyfile antes; reload é gracioso e não derruba os outros sites).
6. Criar o usuário (senha por TTY, ≥15): `ssh -t <host> 'docker run --rm -it --network linkedin-ops_internal
   --env-file ~/linkedin-ops/.env linkedin-ops/api-tools:current pnpm setup:user'` (comando final definido
   pela T-015).
7. Backup: `infra/deploy/backup-offsite.sh setup-key`, rodar `~/linkedin-ops/backup-db.sh` uma vez na VM,
   `backup-offsite.sh pull` e `backup-offsite.sh restore-test` — obrigatório antes do primeiro post.

## Rollback

`deploy <sha anterior>` (as releases ficam em `~/linkedin-ops/releases/`). Migrations são só aditivas no
MVP-0; para desfazer uma, ver `docs/runbooks/database-migrations.md`.
