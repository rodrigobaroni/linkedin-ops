# infra/docker

Stack Docker Compose do LinkedIn Ops (T-003). O arquivo base é compartilhado por desenvolvimento e
produção (T-056); `docker-compose.dev.yml` acrescenta portas locais e hot reload.

## Serviços

| Serviço    | Imagem                                                               | Papel                                                                  | Porta no host (só dev)         |
| ---------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------ |
| `postgres` | `postgres:17-alpine@sha256:b0f956…` (mesmo digest do Testcontainers) | Banco da aplicação e do pg-boss (ADR-0002)                             | `127.0.0.1:${POSTGRES_PORT}`   |
| `s3`       | `rustfs/rustfs:1.0.1@sha256:1803fa…` (digest multiarch)              | Object storage S3-compatible para dev/CI (ADR-0001, emenda 2026-10-16) | `127.0.0.1:${S3_PORT}`         |
| `s3-init`  | `amazon/aws-cli:2.38.1@sha256:733d5b…`                               | One-shot: cria o bucket privado via S3 padrão e sai                    | —                              |
| `api`      | build `apps/api/Dockerfile`                                          | API NestJS (placeholder até T-008)                                     | `127.0.0.1:3001`               |
| `worker`   | build `apps/worker/Dockerfile`                                       | Worker pg-boss (placeholder até T-006)                                 | —                              |
| `web`      | build `apps/web/Dockerfile`                                          | Dashboard Next.js                                                      | `127.0.0.1:3000`               |
| `caddy`    | `caddy:2.11.7-alpine`                                                | Borda TLS, `/api/*` → api, `/` → web (`infra/caddy`)                   | `${CADDY_BIND_ADDRESS}:80/443` |

Volumes nomeados: `pg-data`, `s3-data`, `caddy-data`, `caddy-config`. Rede única `internal`; no arquivo
base só o Caddy publica portas (em `127.0.0.1` por padrão; produção define `CADDY_BIND_ADDRESS=0.0.0.0`).

## Como usar

Pré-requisito: Docker Engine com Compose v2 (≥ 2.24, por causa de `env_file.required`) e BuildKit.
Docker **não** está instalado na máquina de bootstrap; a validação oficial desta stack é o job
`compose-smoke` em `.github/workflows/ci.yml` (decisão de Rodrigo, 2026-10-13).

```bash
cp .env.example .env            # defaults de dev já marcados; nunca commitar o .env
pnpm dev:infra                  # sobe postgres + s3 (+ bucket) e espera os health checks
pnpm dev:infra:logs             # logs de postgres e s3
pnpm dev:infra:down             # para e mantém os volumes (use `-v` manualmente para apagar dados)
pnpm dev:stack                  # stack completa com hot reload (api, worker, web, caddy)
pnpm compose ps                 # qualquer subcomando do Compose com os arquivos certos
```

Os scripts passam `--env-file .env`; sem ele o Compose usa apenas os defaults `${VAR:-...}` do arquivo
base, que são os mesmos "dev default" do `.env.example`.

## Variáveis que o Compose consome

`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`, `S3_ACCESS_KEY_ID`,
`S3_SECRET_ACCESS_KEY`, `S3_REGION`, `S3_BUCKET`, `S3_PORT`, `CADDY_SITE_ADDRESS`, `CADDY_TLS`,
`CADDY_BIND_ADDRESS`, `CADDY_HSTS_MAX_AGE`, `NODE_ENV`, `APP_TIMEZONE`, `LOG_LEVEL`, `IMAGE_TAG`.
Dentro da rede o Compose sobrescreve `DATABASE_URL` (host `postgres`) e `S3_ENDPOINT` (`http://s3:9000`)
para `api` e `worker`; `web` não recebe `env_file` nem segredos (ADR-0001).

## Object storage: RustFS em dev/CI

- Motivo: as imagens `minio/minio` e `minio/mc` foram removidas do Docker Hub (set/2026) e o repositório
  upstream foi arquivado; ver emenda de 2026-10-16 no ADR-0001.
- Licença verificada: Apache-2.0 (repositório `rustfs/rustfs`, release 1.0.1 de 2026-10-03).
- Imagem pinada por tag **e** digest do manifest list (multiarch `linux/amd64` + `linux/arm64`); o
  Dependabot (`package-ecosystem: docker`) propõe atualizações, inclusive a 1.0.2.
- Regras de uso: só S3 padrão (SigV4, path-style, URLs pré-assinadas) via `S3_*`. Nenhum console, admin
  API ou SDK específico do fornecedor em código, scripts ou CI, para que o store de dev seja substituível
  sem mudança de código. Console desabilitado (`RUSTFS_CONSOLE_ENABLE=false`); processo roda como uid
  10001; bucket privado, sem policy pública.
- Em dev a credencial root do servidor é o próprio par `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`.
- Varredura: o `security.yml` roda Trivy em modo `fs` (lockfile + misconfig dos arquivos de infra, incluindo
  Dockerfiles e Compose); o scan **da imagem** RustFS e das imagens dos apps entra com T-062 (`trivy image`).
- Condição de T-056: antes do primeiro deploy, repetir o round-trip S3 do `compose-smoke` (PUT → URL
  pré-assinada → HEAD, comparando sha256) contra o bucket real do OCI Object Storage.

## Imagens dos apps

`apps/*/Dockerfile` são multi-stage (`deps` → `build` → `prod-deps` → `runtime`, mais `dev` para hot
reload), base `node:24.22.0-alpine`, pnpm na versão de `package.json#packageManager`, runtime não-root
(`node`). Nesta fase api e worker são placeholders que encerram logo após iniciar; os health checks HTTP
chegam com T-008 (api, `GET /health`) e T-006 (worker). Digests para as imagens oficiais restantes (
`caddy`, `node`) e scan de imagem entram em T-062.
