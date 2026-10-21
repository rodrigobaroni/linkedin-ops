# Prova real da API do LinkedIn (T-061 / gate G-01)

> Status: **PARCIAL**. OAuth, escopos, `userinfo` e `LinkedIn-Version` foram provados com o app real em
> 2026-10-21. Faltam duas coisas: a publicação de teste (`POST /rest/posts`) e o diagnóstico do `nonce`
> no `id_token`, que está aberto e bloqueia o connect. O G-01 continua **aberto**.

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
# 1. Autorização + userinfo + diagnóstico do id_token + checagem de versão (nada é publicado)
pnpm --filter @linkedin-ops/api linkedin:probe

# 2. (Opcional) PKCE: mesma coisa enviando code_challenge S256
pnpm --filter @linkedin-ops/api linkedin:probe -- --pkce

# 3. Publicação de teste: só com o texto aprovado pelo Rodrigo, confirmada digitando PUBLICAR
pnpm --filter @linkedin-ops/api linkedin:probe -- --publish-file /caminho/absoluto/texto.txt
```

O token existe só na memória do processo. Ele nunca é impresso nem gravado, e os erros do LinkedIn são
reduzidos a `code`/`message`. O diagnóstico do `id_token` imprime só **nomes** de claims e booleanos,
nunca valores. O `sub` do membro não entra neste documento.

## Resultados — execução 1 (2026-10-21, Rodrigo, sem `--publish-file`, sem `--pkce`)

| Item | Resultado |
| --- | --- |
| Data / operador | 2026-10-21 / Rodrigo, máquina local |
| Escopos pedidos | `openid profile w_member_social` |
| Escopos concedidos | `openid profile w_member_social` ✅ (todos; nenhum a mais) |
| Validade do access token (`expires_in`) | 5 183 999 s (~60 dias) |
| Refresh token emitido | não (esperado: o app não tem essa aprovação) |
| `id_token` emitido | sim |
| `id_token.nonce` confere | **não**. A execução 1 não separava "ausente" de "diferente"; ver abaixo |
| Campos de `GET /v2/userinfo` | `family_name, given_name, locale, name, picture, sub` (sem `email`, como pedido) |
| `X-Restli-Protocol-Version` devolvido pelo `userinfo` | `1.0.0` (endpoint v2; o `/rest/posts` usa `2.0.0`) |
| `LinkedIn-Version` usada e aceita | `202608` aceita ✅. `GET /rest/posts/urn:li:share:0` respondeu `403 ACCESS_DENIED` (`partnerApiPostsExternal.GET.20260801`), não `426`. A versão resolveu para `20260801`; o 403 é esperado, porque ler posts exige `r_member_social`, que não é pedido |
| PKCE S256 aceito | não testado (sem `--pkce`); `LINKEDIN_PKCE=disabled` continua valendo (N3) |
| `POST /rest/posts` (texto) | **pendente**: depende de um texto de teste aprovado pelo Rodrigo |
| URN retornado (`x-restli-id`) | pendente |
| Formação do author URN (`urn:li:person:<sub>`) | pendente: só se confirma com o 201 do `POST /rest/posts` (N3). O discovery declara `subject_types_supported: pairwise` |
| Headers de limite observados | nenhum `x-ratelimit*`/`retry-after` nas respostas de `userinfo` e `/rest/posts`; só `x-restli-gateway-error: true` no 403 |

### Discovery OIDC público do LinkedIn (consultado em 2026-10-21, sem credenciais)

`https://www.linkedin.com/oauth/.well-known/openid-configuration`:

- `issuer`: `https://www.linkedin.com/oauth` (igual a `LINKEDIN_OIDC_ISSUER`);
- `jwks_uri`: `https://www.linkedin.com/oauth/openid/jwks`; `id_token_signing_alg_values_supported`: `RS256`;
- `response_types_supported`: `code`; `subject_types_supported`: `pairwise`;
- `claims_supported`: `iss, aud, iat, exp, sub, name, given_name, family_name, picture, email,
  email_verified, locale`. **`nonce` não aparece.**

A JWKS tinha uma chave RSA com `kid`, **sem** `alg` e sem `use`. A validação da API aceita esse formato:
o teste unitário `works with LinkedIn's real JWKS shape` cobre o caso.

## Pendências para fechar o G-01

1. **Nonce (bloqueia o connect).** A validação atual do `id_token` (Sentinela A-2) exige `nonce` presente
   e igual ao enviado. Com o resultado da execução 1, o connect falharia sempre com `reason=exchange_failed`.
   O probe agora informa os nomes dos claims e se o `nonce` está ausente, vazio, diferente (incluindo se
   voltou como SHA-256) ou igual. Também informa `iss`/`aud` como booleanos, `alg`/`kid` do header, a
   assinatura RS256 pela JWKS e se o `sub` é igual ao do `userinfo`. **Ação:** o Rodrigo roda de novo
   `pnpm --filter @linkedin-ops/api linkedin:probe` (sem publicar) e a Sentinela decide pela evidência.
   A validação não muda antes disso.
2. **Publicação de teste.** O Rodrigo aprova um texto e roda o probe com `--publish-file`. Registrar aqui
   o HTTP 201, o formato do `x-restli-id` (`urn:li:share:` ou `urn:li:ugcPost:`), os headers de limite e
   a confirmação de que `urn:li:person:<sub>` foi aceito como `author`.
3. **PKCE (opcional para o MVP-0).** Rodar com `--pkce`. Se o fluxo for aceito, propor
   `LINKEDIN_PKCE=required` em outra tarefa (hoje o boot recusa `required`).

## Decisões derivadas

- `LinkedIn-Version: 202608` fica fixada no código (`linkedin.constants.ts`); qualquer troca exige nova
  execução do probe.
- Sem refresh token: o painel mostra a expiração (~60 dias) e pede reconexão (Sentinela, condição 10).
- `email` continua fora dos escopos; o `userinfo` confirma que ele não é devolvido.
- Nonce: **aguardando decisão da Sentinela** (ver pendência 1).
