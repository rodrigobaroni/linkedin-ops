# infra/docker

Stack Docker Compose do LinkedIn Ops (T-003). O arquivo base é compartilhado por desenvolvimento e
produção (T-056); `docker-compose.dev.yml` acrescenta o object store de dev/CI (`s3`, `s3-init`), os
endereços internos da rede, as portas locais, `NODE_ENV=development` e o hot reload. É essa combinação
que o job `compose-smoke` valida.

## Serviços

| Serviço    | Imagem                                                               | Papel                                                                | Porta no host (só dev)         |
| ---------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------ |
| `postgres` | `postgres:17-alpine@sha256:b0f956…` (mesmo digest do Testcontainers) | Banco da aplicação e do pg-boss (ADR-0002)                           | `127.0.0.1:${POSTGRES_PORT}`   |
| `s3`       | `rustfs/rustfs:1.0.1@sha256:1803fa…` (digest multiarch)              | Object storage S3-compatible só em dev/CI (`docker-compose.dev.yml`) | `127.0.0.1:${S3_PORT}`         |
| `s3-init`  | `amazon/aws-cli:2.38.1@sha256:733d5b…`                               | One-shot (só dev/CI): cria o bucket privado via S3 padrão e sai      | —                              |
| `api`      | build `apps/api/Dockerfile`                                          | API NestJS (placeholder até T-008)                                   | `127.0.0.1:3001`               |
| `worker`   | build `apps/worker/Dockerfile`                                       | Worker pg-boss (placeholder até T-006)                               | —                              |
| `web`      | build `apps/web/Dockerfile`                                          | Dashboard Next.js                                                    | `127.0.0.1:3000`               |
| `caddy`    | `caddy:2.11.7-alpine@sha256:d8542f…`                                 | Borda TLS, `/api/*` → api, `/` → web (`infra/caddy`)                 | `${CADDY_BIND_ADDRESS}:80/443` |

Volumes nomeados: `pg-data`, `caddy-data`, `caddy-config` (base) e `s3-data` (dev). Rede única `internal`;
no arquivo base só o Caddy publica portas (em `127.0.0.1` por padrão; produção define
`CADDY_BIND_ADDRESS=0.0.0.0`). Em produção `DATABASE_URL` e `S3_ENDPOINT` apontam, via `.env`, para os
serviços gerenciados (T-056); a base não sobe object store.

`NODE_ENV` é modo do processo e não vem do `.env`: a base fixa `production` em `api`, `worker` e `web`; o
override de dev fixa `development` nos três (`next dev` exige). O `NODE_ENV=development` do `.env.example`
serve só para rodar os apps direto na máquina (`pnpm dev`).

## Como usar

Pré-requisito: Docker Engine com Compose v2 (≥ 2.24, por causa de `env_file.required`) e BuildKit.
Docker **não** está instalado na máquina de bootstrap; a validação oficial desta stack é o job
`compose-smoke` em `.github/workflows/ci.yml` (decisão de Rodrigo, 2026-10-13).

O `.env` é obrigatório: o arquivo base não tem defaults de interpolação para credenciais, banco e object
store (`${VAR:?}`) e recusa renderizar sem ele (fail-closed; o `compose-smoke` prova isso). Os valores de
dev existem só no `.env.example`.

```bash
cp .env.example .env            # defaults de dev já marcados; nunca commitar o .env
pnpm dev:infra                  # sobe postgres + s3 (+ bucket) e espera os health checks
pnpm dev:infra:logs             # logs de postgres e s3
pnpm dev:infra:down             # para e mantém os volumes (use `-v` manualmente para apagar dados)
pnpm dev:stack                  # stack completa com hot reload (api, worker, web, caddy)
pnpm compose ps                 # qualquer subcomando do Compose com os arquivos certos
```

Os scripts de `package.json` passam `--env-file .env` e os dois arquivos Compose; sem `.env` o Compose
falha na interpolação, de propósito.

## Variáveis que o Compose consome

Obrigatórias (`${VAR:?}`): `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL`,
`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`. Com default seguro:
`S3_FORCE_PATH_STYLE`, `APP_TIMEZONE`, `LOG_LEVEL`, `IMAGE_TAG`, `CADDY_SITE_ADDRESS`, `CADDY_TLS`,
`CADDY_BIND_ADDRESS`, `CADDY_HSTS_MAX_AGE`, `POSTGRES_PORT` e `S3_PORT` (portas só no override de dev).
O override de dev sobrescreve `DATABASE_URL` (host `postgres`) e `S3_ENDPOINT` (`http://s3:9000`) para
`api` e `worker`; `web` não recebe `env_file` nem segredos (ADR-0001).

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
reload), base `node:24.22.0-alpine` pinada por tag e digest (default do `ARG NODE_IMAGE`), frontend
BuildKit `docker/dockerfile:1.7` também por digest, pnpm na versão de `package.json#packageManager`,
runtime não-root (`node`). O stage `prod-deps` instala com `--ignore-scripts` (o `prepare` raiz, husky, não existe sem
devDependencies) e em seguida roda `pnpm rebuild --pending -r --filter <app>...`, que executa só os build
scripts permitidos em `onlyBuiltDependencies` (`pnpm-workspace.yaml`). A api expõe `GET /api/v1/health`
por um listener placeholder (`apps/api/src/server.ts`) até T-008; o worker ainda é um placeholder que
encerra logo após iniciar (health check chega com T-006).

Condições registradas na revisão do PR #80 (Atlas 2), também anotadas em T-008 e T-006:

- O runtime copia **apenas** `packages/contracts/dist` e o `dist` do app. Quando `api`/`worker` passarem
  a depender de `@linkedin-ops/domain` (client Prisma gerado) e `@linkedin-ops/editorial-engine`, é
  preciso acrescentar os `COPY --from=build` correspondentes ou migrar para
  `pnpm deploy --prod --filter <app>`, que resolve o problema de forma geral.
- O `rebuild --pending` com `argon2` e `@prisma/engines` em Alpine/musl ainda não foi exercitado no CI:
  a primeira imagem que os incluir valida isso no `compose-smoke` (prebuild musl do argon2; o download
  dos engines exige rede durante o build).

Supply chain (revisão do PR #80, Sentinela 3): todas as imagens (`postgres`, `caddy`, `rustfs`, `aws-cli`,
`node`) estão pinadas por tag **e** digest do manifest list; o Dependabot (`package-ecosystem: docker`,
diretórios `infra/docker` e `apps/*`) renova tag e digest. Ponto a observar no primeiro PR do Dependabot:
o digest do `node` vive no default de um `ARG NODE_IMAGE`; se o Dependabot não o propuser, trocar por um
`FROM node:…@sha256:…` literal. A linha `# syntax=docker/dockerfile:…@sha256:…` não é coberta pelo
Dependabot e se renova manualmente (ou em T-062, junto com o `trivy image`).

O `compose-smoke` constrói as imagens de runtime a partir do arquivo base e as testa fora do Compose
(web serve HTML, api responde o health JSON, worker sai com código 0), além da combinação de dev com
Caddy.
