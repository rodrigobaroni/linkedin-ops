# T-003 · Ambiente de desenvolvimento com Docker Compose

- Épico: EPIC-00 Foundation
- Responsável (papel/agente): Estaleiro (plataforma)
- Branch/floor: `chore/T-003-docker-compose-dev`
- Estado: todo
- Dependências: T-001

## Contexto

Dev e produção usam Docker Compose + Caddy. Postgres e storage S3-compatible (MinIO) precisam subir localmente com um comando. Risco registrado: Docker não está instalado na máquina local de Rodrigo (delivery-status).

## Resultado esperado

`infra/docker/docker-compose.yml` (postgres, minio, api, web, worker) + `docker-compose.dev.yml` (volumes e hot reload), `infra/caddy/Caddyfile` para local e produção, Dockerfiles multi-stage por app, `pnpm dev:infra` que sobe só postgres+minio. Instruções no `README.md`.

## Critérios de aceite (verificáveis)

- [ ] `docker compose -f infra/docker/docker-compose.yml up -d postgres minio` sobe e health checks ficam `healthy`.
- [ ] `.env.example` cobre todas as variáveis que o Compose exige; nenhum valor real.
- [ ] Build das imagens de api/web/worker conclui (podem ser "hello world" nesta fase).
- [ ] Caddy serve web e api sob um único host local com TLS auto-assinado ou `localhost`.

## Fora de escopo

Deploy Oracle (T-056), backups (T-055).

## Plano de teste

Subir do zero, verificar `docker compose ps`, conectar no Postgres com `DATABASE_URL` do `.env.example`.

## Riscos de segurança / compliance

Credenciais default só em dev; portas não expostas além do necessário; imagens oficiais com tag fixa.
