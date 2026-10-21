# infra/caddy

`Caddyfile` único para local (T-003) e produção (T-056), parametrizado por variáveis de ambiente lidas
pelo serviço `caddy` do Compose:

| Variável             | Dev (padrão) | Produção (T-056)            |
| -------------------- | ------------ | --------------------------- |
| `CADDY_SITE_ADDRESS` | `localhost`  | host público                |
| `CADDY_TLS`          | `internal`   | e-mail ACME (Let's Encrypt) |
| `CADDY_HSTS_MAX_AGE` | `0`          | `31536000`                  |
| `CADDY_BIND_ADDRESS` | `127.0.0.1`  | `0.0.0.0`                   |

Roteamento same-origin: `/api/*` → `api:3001`, tudo o mais → `web:3000` (sem CORS em produção).
Em dev o Caddy emite certificado pela sua CA interna (auto-assinado): o browser avisa na primeira visita a
`https://localhost`; para confiar na CA, exporte `/data/caddy/pki/authorities/local/root.crt` do volume
`caddy-data`. HSTS fica em `max-age=0` em dev para não quebrar `http://localhost:3000`.

Headers (TM-18): HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
`Permissions-Policy`, remoção de `Server`/`X-Powered-By`; sem `trusted_proxies`: o Caddy é a borda e o
`X-Forwarded-For` enviado por clientes é ignorado (um LB/CDN futuro exige CIDRs exatos e
`trusted_proxies_strict`); admin API só no loopback do container (health check). Apenas 80/443 são
publicadas. O access log JSON passa por um filtro que remove `code`, `state` e tokens da query string e os
headers `Cookie`/`Authorization`/`Set-Cookie`; o `compose-smoke` prova isso a cada PR.
