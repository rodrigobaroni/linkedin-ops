# Deploy do MVP-0 em host com proxy compartilhado (VM Oracle do Rodrigo)

Decisão de 2026-10-21: o MVP-0 roda na VM Oracle que já hospeda outros serviços atrás de um Caddy próprio
(stack do n8n). Por isso o Caddy da nossa stack fica desligado e o Caddy existente ganha um bloco de site.
Domínio: `linkedin.baroni.dedyn.io` (registro A na deSEC apontando para o IP reservado da VM).

## Peças

- `infra/docker/docker-compose.shared-proxy.yml`: desliga nosso `caddy`; publica `web` e `api` só em
  `172.17.0.1:3100/3101` (bridge do Docker, nunca interface pública). O `worker` (pg-boss, dono do schema
  `pgboss`) roda com a stack, sem portas publicadas e com env enumerada no Compose base.
- `infra/caddy/shared-proxy.site.caddy.example`: bloco de site com os mesmos cabeçalhos de segurança e o
  filtro de access log (sem `code`/`state`/tokens/cookies) do `infra/caddy/Caddyfile`.
- `infra/deploy/deploy-shared-host.sh`: `init-env` (cria `~/linkedin-ops/.env` 0600 na VM, segredos gerados
  lá; credenciais do LinkedIn e `OPENAI_API_KEY`/`OPENAI_MODEL` vão por stdin, lidas do `.env` local),
  `escrow-key` (cópia da `ENCRYPTION_KEY` no Keychain do Mac; recusa sobrescrever uma entrada com valor
  diferente), `add-openai [--replace]` (acrescenta as chaves da OpenAI a um `.env` existente), `deploy [ref]` (git archive via SSH, build de
  api/web/worker na VM, migrations, sobe o worker e espera as filas, depois api+web, health), `status`
  (containers, release atual e presença — nunca o valor — de `OPENAI_API_KEY`/`OPENAI_MODEL`).
- `infra/deploy/backup-db.sh` + `infra/deploy/backup-offsite.sh`: dump diário cifrado com a chave GPG
  PÚBLICA do Mac (a VM não consegue decifrar), cópia para `~/Backups/linkedin-ops` no Mac e teste de
  restore real em container descartável.

## Pré-requisitos de segurança (Sentinela S-3, antes do primeiro post)

- Evidência de **IP público reservado** da VM (OCI: Networking → Reserved Public IPs), anotada aqui com a data.
- **TCP/22 restrito** ao IP/CIDR do operador no **NSG/Security List da OCI** e no firewall da VM; 80/443 seguem
  globais. Atenção: com IP residencial dinâmico, manter acesso alternativo (Cloud Shell/console serial da OCI)
  antes de restringir, para não perder o acesso.

## Primeira vez (ordem)

1. deSEC: registro A `linkedin.baroni.dedyn.io` → IP da VM. Portal do LinkedIn: redirect
   `https://linkedin.baroni.dedyn.io/api/v1/auth/linkedin/callback`.
2. `export DEPLOY_HOST=ubuntu@<ip> DEPLOY_SSH_KEY=<chave> APP_HOST=linkedin.baroni.dedyn.io`; o `.env` local
   precisa de `LINKEDIN_CLIENT_ID/SECRET`, `OPENAI_API_KEY` e `OPENAI_MODEL` (o worker não sobe em produção sem
   os dois últimos, `validateWorkerEnv`).
3. `infra/deploy/deploy-shared-host.sh init-env` (idempotente; recusa um `.env` remoto incompleto, inclusive sem
   as chaves da OpenAI, e lista o que falta) e `infra/deploy/deploy-shared-host.sh escrow-key`.
4. `infra/deploy/backup-offsite.sh setup-key` (gera a chave GPG no Mac com senha; instala a pública, o
   `backup-db.sh` e o cron na VM). A partir do segundo deploy, `deploy` recusa migrar sem backup.
5. `REQUIRE_PUBLIC=0 infra/deploy/deploy-shared-host.sh deploy origin/main` (o bloco do Caddy ainda não existe).
6. Caddy existente: backup do Caddyfile, acrescentar o bloco do `.example` com o hostname real,
   `caddy validate` e `caddy reload` (gracioso, não derruba os outros sites). Conferir o certificado:
   `curl -sv https://linkedin.baroni.dedyn.io/api/v1/health` (emissor Let's Encrypt). Prova do filtro de log:
   requisição com `?code=canario&state=canario` e header `X-CSRF-Token: canario`; nenhum `canario` no log.
7. Deploys seguintes: `infra/deploy/deploy-shared-host.sh deploy origin/main` (exige HTTPS público ok).
8. Criar o usuário (senha por TTY, ≥15), comando definido pela T-015.
9. Backup antes do primeiro post: rodar `~/linkedin-ops/backup-db.sh` na VM, `backup-offsite.sh pull`,
   `backup-offsite.sh restore-test`, e `backup-offsite.sh install-launchd` **a partir do checkout principal**
   (`~/Developer/LinkedinAutomation`, não de um floor, que pode ser removido).

## Upgrade de um `.env` anterior ao worker

**Nunca apague `~/linkedin-ops/.env` depois que a stack rodou.** Um `init-env` novo geraria outra
`POSTGRES_PASSWORD` (o volume `pg-data` deixa de abrir) e outra `ENCRYPTION_KEY` (os tokens do LinkedIn deixam de
decifrar): perda irreversível. Se faltarem só `OPENAI_API_KEY`/`OPENAI_MODEL`:

1. Colocar as duas no `.env` local do Mac (nunca em Git).
2. `infra/deploy/deploy-shared-host.sh add-openai`: envia por stdin, mantém 0600, não imprime valores, não toca nas
   outras linhas (confere byte a byte antes de trocar o arquivo) e recusa se alguma já existir; para trocar a
   chave ou o modelo, `add-openai --replace`.
3. `infra/deploy/deploy-shared-host.sh status` (presença das duas) e depois `deploy`.

## Falhas e rollback

- `deploy` usa lock (um deploy por vez) e imagens imutáveis por sha (`linkedin-ops/api:<sha>`).
- Backup cifrado antes de qualquer migration; se a migration falhar, a release em execução **não** é tocada e o
  script imprime os próximos passos (status do Prisma, `migrate resolve`, restore). Sem retry cego.
- Todo `up --wait` tem limite: `--wait-timeout 120` quando o Compose da VM suporta a flag, e sempre um
  `timeout 150` externo, para um Compose antigo não travar deploy nem rollback.
- Antes do build, `deploy` recusa seguir se `OPENAI_API_KEY` ou `OPENAI_MODEL` faltar no `.env` da VM (checa só
  a presença; o valor nunca é impresso).
- Depois das migrations o `worker` sobe **antes** de api/web e precisa ficar healthy e criar as filas
  `cv.extract` e `cv.extract.dlq` em `pgboss.queue` em até 60 s (sem elas a API responde 503 aos uploads de CV).
  Se falhar, api/web seguem intocados, os logs do worker vão para o terminal e o worker volta para a imagem da
  release anterior, se existir, ou é parado.
- Se `up` ou os health checks (api `/health` e `/ready`, web, HTTPS público) falharem, `api`/`web` voltam
  automaticamente para a release anterior (o symlink `current`, única referência da release em execução), que só avança quando tudo passa. O worker volta junto, pela mesma regra acima, e os logs de api, web e worker vão para o terminal. A cópia do código é preparada num diretório temporário e promovida sob o lock. Depois da migration, `db:migrate:status` precisa sair limpo.
- Rollback manual: `deploy <sha anterior>`; as releases ficam em `~/linkedin-ops/releases/`.

## Custos e cota da OpenAI

- Cada upload de CV gera um job `cv.extract` = 1 chamada ao `OPENAI_MODEL` (pior caso 6 requisições HTTP; tetos
  por fila em `apps/worker/README.md`); o custo depende do modelo e do tamanho do CV, por isso defina um limite
  de gasto e alerta no projeto da OpenAI em vez de estimar aqui.
- Cota esgotada (`429 insufficient_quota`) não é repetida nem pelo cliente HTTP nem pela fila: o job vai direto
  para `cv.extract.dlq`, o CV termina com falha `ai` e a API continua no ar.
