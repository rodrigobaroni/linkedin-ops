# Prova real da API do LinkedIn (T-061 / gate G-01)

> Status: **PENDENTE** — aguardando a execução do probe com o app real do Rodrigo.

## Contexto

O gate G-01 do MVP-0 exige provar, com o app e o token reais, que o fluxo OAuth 2.0 (authorization code)
concede `w_member_social` e que `POST /rest/posts` publica texto como membro. Condições da Sentinela
(2026-10-21): escopos **só** `openid profile w_member_social`, `LinkedIn-Version` fixo e suportado,
`X-Restli-Protocol-Version: 2.0.0`, PKCE desligado de forma explícita (N3) até a prova dizer o contrário.

## Como reproduzir

Pré-requisitos: `.env` na raiz do worktree com `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` e
`LINKEDIN_REDIRECT_URI=http://localhost:3001/api/v1/auth/linkedin/callback`. Essa URL precisa estar
cadastrada no portal do app. A porta 3001 precisa estar livre, ou seja, a API não pode estar rodando.

```sh
# 1. Autorização + userinfo + checagem de versão (nada é publicado)
pnpm --filter @linkedin-ops/api linkedin:probe

# 2. (Opcional) PKCE: mesma coisa enviando code_challenge S256
pnpm --filter @linkedin-ops/api linkedin:probe -- --pkce

# 3. Publicação de teste: só com o texto aprovado pelo Rodrigo, confirmada digitando PUBLICAR
pnpm --filter @linkedin-ops/api linkedin:probe -- --publish-file /caminho/absoluto/texto.txt
```

O token existe só na memória do processo. Ele nunca é impresso nem gravado, e os erros do LinkedIn são
reduzidos a `code`/`message`.

## Resultados

| Item | Resultado |
| --- | --- |
| Data / operador | pendente |
| Escopos pedidos | `openid profile w_member_social` |
| Escopos concedidos | pendente |
| Validade do access token (`expires_in`) | pendente |
| Refresh token emitido | pendente |
| `id_token` emitido / `nonce` confere | pendente |
| Campos de `GET /v2/userinfo` | pendente |
| `LinkedIn-Version` usada e aceita | pendente (fixada em `202608` no código) |
| PKCE S256 aceito | pendente |
| `POST /rest/posts` (texto) | pendente |
| URN retornado (`x-restli-id`) | pendente |
| Headers de limite observados | pendente |

## Decisões derivadas

- pendente
